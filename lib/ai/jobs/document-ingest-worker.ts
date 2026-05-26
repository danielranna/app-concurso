import { supabaseServer } from "../../supabase-server"
import {
  failDocumentIngest,
  ingestDocumentPipeline,
} from "../document-ingest"
import { DOCUMENT_PIPELINE_JOB_TYPES } from "./document-enqueue"
import type { JobType } from "./queue"

const SERIAL_INGEST_TYPES: JobType[] = [...DOCUMENT_PIPELINE_JOB_TYPES]
const STALE_RUNNING_MS = 2 * 60 * 1000
const PIPELINE_STAGES = ["uploaded", "parsing", "chunking", "embedding"] as const
const RECENT_WAVE_MS = 72 * 60 * 60 * 1000
const MAX_AUTO_RETRIES = 1

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

type DocRow = {
  id: string
  title: string
  ingest_stage: string | null
  ingest_error?: string | null
  page_count?: number | null
  subject_id: string | null
  created_at: string
  last_ingested_at: string | null
  parsed_tables?: Record<string, unknown> | null
  subjects?: { name: string } | { name: string }[] | null
}

function subjectNameFromRow(row: DocRow): string | null {
  const s = row.subjects
  if (!s) return null
  if (Array.isArray(s)) return s[0]?.name ?? null
  return s.name ?? null
}

function isRecentWaveDoc(d: DocRow): boolean {
  const created = new Date(d.created_at).getTime()
  const ingested = d.last_ingested_at
    ? new Date(d.last_ingested_at).getTime()
    : 0
  return Date.now() - Math.max(created, ingested) < RECENT_WAVE_MS
}

function queueSortTime(d: DocRow): number {
  const pt = (d.parsed_tables ?? {}) as { queue_sort_at?: string }
  if (pt.queue_sort_at) return new Date(pt.queue_sort_at).getTime()
  return new Date(d.created_at).getTime()
}

function sortByQueue(docs: DocRow[]) {
  return [...docs].sort((a, b) => queueSortTime(a) - queueSortTime(b))
}

/** Próximo da fila: enviados mas não prontos, ordenados por queue_sort_at. */
export function pickNextPendingId(
  all: DocRow[],
  options?: { random?: boolean }
): string | null {
  const waiting = sortByQueue(
    all.filter((d) => d.ingest_stage === "uploaded")
  )
  if (!waiting.length) return null
  if (options?.random) {
    return waiting[Math.floor(Math.random() * waiting.length)]!.id
  }
  return waiting[0]!.id
}

export async function healStaleRunningJobs(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString()
  let healed = 0

  const { data: staleStarted } = await supabaseServer
    .from("ai_jobs")
    .update({
      status: "pending",
      started_at: null,
      error_message: null,
    })
    .eq("user_id", userId)
    .eq("status", "running")
    .in("job_type", SERIAL_INGEST_TYPES)
    .lt("started_at", cutoff)
    .select("id")

  healed += staleStarted?.length ?? 0

  const orphanCutoff = new Date(Date.now() - 90 * 1000).toISOString()
  const { data: orphanRunning } = await supabaseServer
    .from("ai_jobs")
    .update({
      status: "pending",
      started_at: null,
      error_message: null,
    })
    .eq("user_id", userId)
    .eq("status", "running")
    .in("job_type", SERIAL_INGEST_TYPES)
    .is("started_at", null)
    .lt("created_at", orphanCutoff)
    .select("id")

  healed += orphanRunning?.length ?? 0
  return healed
}

/** PDFs presos em parsing sem worker = voltam para uploaded. */
export async function resetOrphanPipelineDocs(userId: string): Promise<number> {
  if (await userHasRunningDocumentJob(userId)) return 0

  const { data: stuck, error } = await supabaseServer
    .from("subject_documents")
    .select("id, parsed_tables")
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .in("ingest_stage", ["parsing", "chunking", "embedding"])

  if (error) throw new Error(error.message)
  let n = 0
  for (const row of stuck ?? []) {
    const pt = (row.parsed_tables ?? {}) as Record<string, unknown>
    await supabaseServer
      .from("subject_documents")
      .update({
        ingest_stage: "uploaded",
        status: "pending",
        ingest_error: null,
        parsed_tables: pt,
      })
      .eq("id", row.id)
    n++
  }
  return n
}

export async function skipPendingIngestJobs(userId: string) {
  await supabaseServer
    .from("ai_jobs")
    .update({
      status: "skipped",
      error_message: "Processamento manual (botão)",
      completed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("job_type", SERIAL_INGEST_TYPES)
}

/** Envia PDF para o fim da fila (quando o primeiro trava). */
export async function deferDocumentToQueueEnd(
  userId: string,
  documentId: string
) {
  const { data: doc, error } = await supabaseServer
    .from("subject_documents")
    .select("parsed_tables")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !doc) throw new Error(error?.message ?? "Documento não encontrado")

  const pt = (doc.parsed_tables ?? {}) as Record<string, unknown>
  await supabaseServer
    .from("subject_documents")
    .update({
      ingest_stage: "uploaded",
      status: "pending",
      ingest_error: null,
      parsed_tables: {
        ...pt,
        queue_sort_at: new Date().toISOString(),
        ingest_retries: 0,
      },
    })
    .eq("id", documentId)

  await skipPendingIngestJobs(userId)
}

/** Reindexar na própria fila (erros). */
export async function requeueDocumentForIngest(
  userId: string,
  documentId: string
) {
  const { data: doc, error } = await supabaseServer
    .from("subject_documents")
    .select("parsed_tables")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !doc) throw new Error(error?.message ?? "Documento não encontrado")

  const pt = (doc.parsed_tables ?? {}) as Record<string, unknown>
  await supabaseServer
    .from("subject_documents")
    .update({
      ingest_stage: "uploaded",
      status: "pending",
      ingest_error: null,
      parsed_tables: { ...pt, ingest_retries: 0 },
    })
    .eq("id", documentId)
}

export type ProcessNextResult = {
  status: "ready" | "failed" | "idle" | "retry"
  document_id?: string
  title?: string
  error?: string
  chunks?: number
  queue: IngestQueueDetails
}

/**
 * Loop do botão: SELECT na DB → processa 1 PDF inteiro → SELECT de novo.
 * Sem fila ai_jobs no caminho feliz.
 */
export async function processNextIngestDocument(
  userId: string,
  options?: { random?: boolean }
): Promise<ProcessNextResult> {
  await healStaleRunningJobs(userId)
  await skipPendingIngestJobs(userId)
  await resetOrphanPipelineDocs(userId)

  let all = await fetchAllStudyDocs(userId)
  const targetId = pickNextPendingId(all, options)

  if (!targetId) {
    return {
      status: "idle",
      queue: await readIngestQueueDetails(userId),
    }
  }

  const doc = all.find((d) => d.id === targetId)!
  const pt = (doc.parsed_tables ?? {}) as { ingest_retries?: number }
  const retries = Number(pt.ingest_retries ?? 0)

  try {
    const result = await ingestDocumentPipeline(userId, targetId)
    return {
      status: "ready",
      document_id: targetId,
      title: doc.title,
      chunks: result.chunks,
      queue: await readIngestQueueDetails(userId),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na indexação"

    if (retries < MAX_AUTO_RETRIES) {
      await supabaseServer
        .from("subject_documents")
        .update({
          ingest_stage: "uploaded",
          status: "pending",
          ingest_error: `Tentativa ${retries + 1} falhou — pode tentar de novo`,
          parsed_tables: { ...pt, ingest_retries: retries + 1 },
        })
        .eq("id", targetId)

      return {
        status: "retry",
        document_id: targetId,
        title: doc.title,
        error: msg,
        queue: await readIngestQueueDetails(userId),
      }
    }

    await failDocumentIngest(targetId, msg)
    return {
      status: "failed",
      document_id: targetId,
      title: doc.title,
      error: msg,
      queue: await readIngestQueueDetails(userId),
    }
  }
}

export async function userHasRunningDocumentJob(userId: string): Promise<boolean> {
  const { data } = await supabaseServer
    .from("ai_jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "running")
    .in("job_type", SERIAL_INGEST_TYPES)
    .limit(1)
    .maybeSingle()

  return Boolean(data?.id)
}

async function fetchAllStudyDocs(userId: string): Promise<DocRow[]> {
  const { data, error } = await supabaseServer
    .from("subject_documents")
    .select(
      "id, title, ingest_stage, ingest_error, page_count, subject_id, created_at, last_ingested_at, parsed_tables, subjects(name)"
    )
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as DocRow[]
}

function toView(
  d: DocRow,
  flags: { is_current: boolean; is_next: boolean }
): IngestQueueItemView {
  const displayStage =
    flags.is_current || flags.is_next
      ? d.ingest_stage ?? "uploaded"
      : d.ingest_stage === "uploaded"
        ? "uploaded"
        : d.ingest_stage ?? "uploaded"

  return {
    id: d.id,
    title: d.title,
    subject_id: d.subject_id,
    subject_name: subjectNameFromRow(d),
    ingest_stage: displayStage,
    ingest_error: d.ingest_error,
    page_count: d.page_count,
    created_at: d.created_at,
    is_current: flags.is_current,
    is_next: flags.is_next,
  }
}

export async function readIngestQueueDetails(
  userId: string,
  options?: { itemLimit?: number }
): Promise<IngestQueueDetails> {
  const itemLimit = options?.itemLimit ?? 5
  const all = await fetchAllStudyDocs(userId)

  const wave = all.filter(
    (d) =>
      d.ingest_stage !== "failed" &&
      (PIPELINE_STAGES.includes(
        (d.ingest_stage ?? "") as (typeof PIPELINE_STAGES)[number]
      ) ||
        (d.ingest_stage === "ready" && isRecentWaveDoc(d)))
  )

  const failedRecent = sortByQueue(
    all.filter((d) => d.ingest_stage === "failed" && isRecentWaveDoc(d))
  )

  const completed = wave.filter((d) => d.ingest_stage === "ready").length
  const total = wave.length
  const running = false

  const waiting = sortByQueue(all.filter((d) => d.ingest_stage === "uploaded"))
  const pending_count = waiting.length

  const active =
    pending_count > 0 || running || failedRecent.length > 0 || completed < total

  if (!active) {
    return {
      active: false,
      running,
      pending_count: 0,
      completed: 0,
      total: 0,
      current: null,
      next: null,
      items: [],
      has_more: false,
      failed_items: [],
      failed_count: 0,
    }
  }

  const nextDoc = waiting[0] ?? null
  const current = null
  const next = nextDoc
    ? toView(nextDoc, { is_current: false, is_next: true })
    : null

  const listWaiting = waiting.slice(1, itemLimit + 1)
  const items = listWaiting.map((d) =>
    toView(d, { is_current: false, is_next: false })
  )

  const failed_items = failedRecent.slice(0, 10).map((d) =>
    toView(d, { is_current: false, is_next: false })
  )

  return {
    active: true,
    running,
    pending_count,
    completed,
    total,
    current,
    next,
    items,
    has_more: waiting.length > itemLimit + 1,
    failed_items,
    failed_count: failedRecent.length,
  }
}

/** Legado: delega ao fluxo do botão. */
export async function runSerialDocumentIngestWorker(userId: string) {
  const result = await processNextIngestDocument(userId)
  return {
    processed: result.status === "ready" ? 1 : 0,
    skipped: result.status === "idle" ? ("idle" as const) : null,
    results: [{ status: result.status, document_id: result.document_id }],
    queue: result.queue,
  }
}

export { SERIAL_INGEST_TYPES }
