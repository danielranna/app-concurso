/** Fila global — controle manual (botão), sem polling automático de processamento. */

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

export type ProcessNextResult = {
  status: "ready" | "failed" | "idle" | "retry"
  document_id?: string
  title?: string
  error?: string
  chunks?: number
  queue: IngestQueueDetails
}

export async function processNextIngest(
  userId: string,
  options?: { random?: boolean }
): Promise<ProcessNextResult> {
  const res = await fetch("/api/coach/jobs/process-next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, random: options?.random ?? false }),
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Falha ao processar")
  }
  return data as ProcessNextResult
}

export async function deferDocumentInQueue(userId: string, documentId: string) {
  const res = await fetch(`/api/coach/documents/${documentId}/defer-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Falha ao adiar")
  }
}

export async function reindexDocumentInQueue(userId: string, documentId: string) {
  const res = await fetch(`/api/coach/documents/${documentId}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Falha ao reindexar")
  }
}
