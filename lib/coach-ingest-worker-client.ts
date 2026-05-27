/** Pipeline de indexação — leitura na Vercel, processamento na VPS. */

import {
  EFFECTIVE_STEP_LABELS,
  workRemainingFromSummary,
  type EffectiveIngestStep,
} from "@/lib/ai/ingest-effective-step"
import {
  getCoachUploadAuthHeaders,
  getCoachUploadBaseUrl,
} from "@/lib/coach-upload-client"

export type { EffectiveIngestStep }
export { EFFECTIVE_STEP_LABELS, workRemainingFromSummary }

const INGEST_DEBUG =
  process.env.NEXT_PUBLIC_COACH_INGEST_DEBUG !== "0"

function logIngest(
  message: string,
  detail?: Record<string, unknown>
) {
  if (!INGEST_DEBUG || typeof window === "undefined") return
  if (detail) {
    console.info(`[coach-ingest] ${message}`, detail)
  } else {
    console.info(`[coach-ingest] ${message}`)
  }
}

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

export type IngestRagStats = {
  complete: number
  lexical_only: number
  partial: number
  need_embed: number
  /** ready na DB mas sem trechos em document_chunks */
  need_chunk: number
  total_with_chunks: number
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
  rag?: IngestRagStats
}

const EMPTY_RAG: IngestRagStats = {
  complete: 0,
  lexical_only: 0,
  partial: 0,
  need_embed: 0,
  need_chunk: 0,
  total_with_chunks: 0,
}

export function queueRag(queue: IngestQueueDetails): IngestRagStats {
  return queue.rag ?? EMPTY_RAG
}

/** uploaded + erros + ready sem trechos (indexação completa). */
export function ingestWorkRemaining(queue: IngestQueueDetails): number {
  const rag = queueRag(queue)
  return queue.pending_count + queue.failed_count + rag.need_chunk
}

export function chunkWorkRemaining(queue: IngestQueueDetails): number {
  return queueRag(queue).need_chunk
}

export function embedWorkRemaining(queue: IngestQueueDetails): number {
  return queueRag(queue).need_embed
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
  const url = `/api/coach/documents/ingest-queue?user_id=${encodeURIComponent(userId)}&limit=${limit}`
  logIngest("Fila: sempre Vercel (leitura)", { url })

  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Falha ao consultar fila")
  }
  return data as IngestQueueDetails
}

export type IngestStatusItem = {
  id: string
  title: string
  subject_id: string | null
  subject_name: string | null
  ingest_stage: string
  effective_step: EffectiveIngestStep
  has_source_text: boolean
  chunks_db: number
  embedded_db: number
  ingest_error?: string | null
  page_count?: number | null
  created_at: string
}

export type IngestStatusDetails = {
  summary: Record<EffectiveIngestStep, number>
  total: number
  filtered_total: number
  items: IngestStatusItem[]
  current_item: IngestStatusItem | null
  recent_errors: IngestStatusItem[]
  offset: number
  limit: number
  has_more: boolean
  batch_running: boolean
}

export async function fetchIngestStatus(
  userId: string,
  options?: {
    step?: EffectiveIngestStep
    limit?: number
    offset?: number
    q?: string
  }
): Promise<IngestStatusDetails> {
  const params = new URLSearchParams({ user_id: userId })
  if (options?.step) params.set("step", options.step)
  if (options?.limit != null) params.set("limit", String(options.limit))
  if (options?.offset != null) params.set("offset", String(options.offset))
  if (options?.q) params.set("q", options.q)

  const url = `/api/coach/documents/ingest-status?${params}`
  logIngest("Status pipeline", { url })

  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Falha ao consultar status")
  }
  return data as IngestStatusDetails
}

export type RunIngestBatchResult = {
  processed: number
  ok: number
  failed: number
  last_error?: string | null
  summary_snapshot: Record<EffectiveIngestStep, number>
  stopped_reason: "idle" | "max_documents" | "max_seconds" | "cancelled" | "busy"
}

export async function runIngestBatchOnVps(
  userId: string,
  options?: {
    maxDocuments?: number
    maxSeconds?: number
    step?: EffectiveIngestStep
  }
): Promise<RunIngestBatchResult> {
  const external = getCoachUploadBaseUrl()
  const headers = external ? await getCoachUploadAuthHeaders() : null

  if (!external || !headers) {
    throw new Error("Configure NEXT_PUBLIC_COACH_UPLOAD_URL e faça login.")
  }

  const controller = new AbortController()
  const maxSeconds = options?.maxSeconds ?? 540
  const timer = setTimeout(
    () => controller.abort(),
    (maxSeconds + 30) * 1000
  )

  const url = `${external}/coach/jobs/run-batch`
  logIngest("Lote VPS", { url, maxSeconds })

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_id: userId,
        max_documents: options?.maxDocuments ?? 20,
        max_seconds: maxSeconds,
        step: options?.step,
      }),
      cache: "no-store",
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error((data as { error?: string }).error ?? "Falha no lote")
    }
    return data as RunIngestBatchResult
  } finally {
    clearTimeout(timer)
  }
}

export async function cancelIngestBatchOnVps(userId: string) {
  const external = getCoachUploadBaseUrl()
  const headers = external ? await getCoachUploadAuthHeaders() : null
  if (!external || !headers) return

  await fetch(`${external}/coach/jobs/cancel-batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: userId }),
    cache: "no-store",
  })
}

export type IngestProcessMode =
  | "full"
  | "embed_only"
  | "chunk_backfill"
  | "auto"

export type ProcessNextResult = {
  status: "ready" | "failed" | "idle" | "retry"
  document_id?: string
  title?: string
  error?: string
  chunks?: number
  embedded?: number
  mode?: IngestProcessMode
  queue: IngestQueueDetails
}

export async function processNextIngest(
  userId: string,
  options?: {
    random?: boolean
    includeFailed?: boolean
    mode?: IngestProcessMode
  }
): Promise<ProcessNextResult> {
  const external = getCoachUploadBaseUrl()
  const headers = external ? await getCoachUploadAuthHeaders() : null

  if (external && !headers) {
    throw new Error("Faça login de novo para indexar arquivos.")
  }

  const controller = new AbortController()
  const timeoutMs = external ? 600_000 : 120_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const url = external
    ? `${external}/coach/jobs/process-next`
    : "/api/coach/jobs/process-next"

  const runtime = external ? "VPS" : "Vercel"
  const mode = options?.mode ?? "auto"
  logIngest(`Processar próximo: ${runtime}`, {
    url,
    uploadBaseUrl: external ?? "(NEXT_PUBLIC_COACH_UPLOAD_URL não definida no build)",
    timeoutMs,
    mode,
    random: options?.random ?? false,
    includeFailed: options?.includeFailed ?? false,
  })

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headers ?? { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        random: options?.random ?? false,
        include_failed: options?.includeFailed ?? false,
        mode,
      }),
      cache: "no-store",
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      logIngest(`Processar próximo falhou (${runtime})`, {
        status: res.status,
        error: (data as { error?: string }).error,
      })
      throw new Error((data as { error?: string }).error ?? "Falha ao processar")
    }

    logIngest(`Processar próximo OK (${runtime})`, {
      status: res.status,
      result: data,
    })
    return data as ProcessNextResult
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logIngest(`Processar próximo erro de rede (${runtime})`, {
      url,
      message: msg,
      aborted: e instanceof Error && e.name === "AbortError",
    })
    throw e
  } finally {
    clearTimeout(timer)
  }
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
