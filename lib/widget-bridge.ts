type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

function tauriInvoke(): Invoke | null {
  if (typeof window === "undefined") return null
  const host = window as Window & {
    __TAURI__?: { core?: { invoke?: Invoke } }
  }
  return host.__TAURI__?.core?.invoke ?? null
}

export function widgetRunningInShell(): boolean {
  return tauriInvoke() != null
}

export async function publishWidgetUser(userId: string): Promise<void> {
  const invoke = tauriInvoke()
  if (!invoke) return
  await invoke("set_user", { userId })
}

export async function openWidgetLink(url: string): Promise<void> {
  const invoke = tauriInvoke()
  if (invoke) {
    await invoke("open_external", { url })
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}

type DragSession = {
  screenX: number
  screenY: number
  windowX: number
  windowY: number
}

let dragSession: Promise<DragSession | null> | null = null
let dragActive = false
let dragChain: Promise<void> = Promise.resolve()

export function beginWidgetDrag(screenX: number, screenY: number): void {
  const invoke = tauriInvoke()
  if (!invoke) return
  dragActive = true
  dragSession = invoke("screen_position")
    .then((position) => {
      if (!Array.isArray(position) || position.length < 2) return null
      const windowX = Number(position[0])
      const windowY = Number(position[1])
      if (!Number.isFinite(windowX) || !Number.isFinite(windowY)) return null
      return { screenX, screenY, windowX, windowY }
    })
    .catch(() => null)
}

export function moveWidgetDrag(screenX: number, screenY: number): void {
  const invoke = tauriInvoke()
  const session = dragSession
  if (!invoke || !dragActive || !session) return
  dragChain = dragChain.then(async () => {
    if (!dragActive) return
    const start = await session
    if (!dragActive || !start) return
    await invoke("set_screen_position", {
      x: Math.round(start.windowX + (screenX - start.screenX)),
      y: Math.round(start.windowY + (screenY - start.screenY)),
    })
  })
}

export function endWidgetDrag(): void {
  dragActive = false
  dragSession = null
}

export async function sendTestNotification(): Promise<void> {
  const invoke = tauriInvoke()
  if (!invoke) {
    throw new Error("Abra pelo widget da área de trabalho.")
  }
  await invoke("test_notification")
}
