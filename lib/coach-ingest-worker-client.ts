/** Fila global de indexação — uma aba/navegador processa por vez. */

const INGEST_LOCK_NAME = "coach-document-ingest"
const LOCK_STORAGE_KEY = "coach-ingest-lock"
const LOCK_TTL_MS = 20_000

export type IngestQueueStatus = {
  pending_count: number
  running: boolean
  active: boolean
}

export async function fetchIngestQueueStatus(
  userId: string
): Promise<IngestQueueStatus> {
  const res = await fetch(
    `/api/coach/documents/ingest-queue?user_id=${encodeURIComponent(userId)}`
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Falha ao consultar fila")
  }
  return data as IngestQueueStatus
}

export async function tickSerialIngestWorker(userId: string): Promise<void> {
  await fetch("/api/coach/jobs/run-ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  })
}

function tryAcquireStorageLock(): boolean {
  if (typeof window === "undefined") return true
  const now = Date.now()
  const raw = window.localStorage.getItem(LOCK_STORAGE_KEY)
  if (raw) {
    const ts = Number(raw)
    if (Number.isFinite(ts) && now - ts < LOCK_TTL_MS) return false
  }
  window.localStorage.setItem(LOCK_STORAGE_KEY, String(now))
  return true
}

function releaseStorageLock(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(LOCK_STORAGE_KEY)
}

/** Só uma aba por navegador executa indexação por vez. */
export async function withGlobalIngestLock(
  fn: () => Promise<void>
): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    let ran = false
    await navigator.locks.request(
      INGEST_LOCK_NAME,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) return
        ran = true
        await fn()
      }
    )
    return ran
  }

  if (!tryAcquireStorageLock()) return false
  try {
    await fn()
    return true
  } finally {
    releaseStorageLock()
  }
}
