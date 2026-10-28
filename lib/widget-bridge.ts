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
