/** Fila global de indexação — um único coordenador no cliente. */

export type IngestQueueItemView = {
  id: string
  title: string
  subject_id: string | null
  subject_name: string | null
  ingest_stage: string
  ingest_error?: string | null
  page_count?: number | null
  created_at: string
  is_current: boolean
  is_next: boolean
}

export type IngestQueueDetails = {
  active: boolean
  running: boolean
  pending_count: number
  completed: number
  total: number
  current: IngestQueueItemView | null
  next: IngestQueueItemView | null
  items: IngestQueueItemView[]
  has_more: boolean
  failed_items: IngestQueueItemView[]
  failed_count: number
}

const STAGE_LABELS: Record<string, string> = {
  uploaded: "Aguardando",
  parsing: "Extraindo texto",
  chunking: "Indexando",
  embedding: "Vetorizando",
}

export function ingestStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage
}

export async function fetchIngestQueueDetails(
  userId: string,
  limit = 5
): Promise<IngestQueueDetails> {
  const res = await fetch(
    `/api/coach/documents/ingest-queue?user_id=${encodeURIComponent(userId)}&limit=${limit}`,
    { cache: "no-store" }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Falha ao consultar fila")
  }
  return data as IngestQueueDetails
}

export type RunIngestResult = {
  processed: number
  skipped: string | null
  results: unknown[]
  queue?: IngestQueueDetails
}

/** Um passo da fila; retorna estado atualizado da fila. */
export async function tickSerialIngestWorker(
  userId: string
): Promise<RunIngestResult> {
  const res = await fetch("/api/coach/jobs/run-ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Falha ao processar fila")
  }
  return data as RunIngestResult
}
