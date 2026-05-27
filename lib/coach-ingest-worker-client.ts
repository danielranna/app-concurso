/** Fila global — controle manual (botão), sem polling automático de processamento. */

import {
  getCoachUploadAuthHeaders,
  getCoachUploadBaseUrl,
} from "@/lib/coach-upload-client"

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
  total_with_chunks: 0,
}

export function queueRag(queue: IngestQueueDetails): IngestRagStats {
  return queue.rag ?? EMPTY_RAG
}

/** Aguardando + erros + falta vetorizar (modo full). */
export function ingestWorkRemaining(queue: IngestQueueDetails): number {
  return queue.pending_count + queue.failed_count
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

export type IngestProcessMode = "full" | "embed_only"

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
  const mode = options?.mode ?? "full"
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
