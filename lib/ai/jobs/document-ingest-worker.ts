import { supabaseServer } from "../../supabase-server"
import {
  embedOnlyDocument,
  failDocumentIngest,
  getChunkEmbedCounts,
  ingestDocumentPipelineWithTimeout,
  isIngestTimeoutError,
  markProcessingStarted,
  ragStatusFromCounts,
  tryFinalizeReadyIfChunked,
  type RagDocStatus,
} from "../document-ingest"
import {
  buildIngestStatusItems,
  pickNextStatusItem,
  type IngestStatusItem,
} from "../ingest-status"
import type { EffectiveIngestStep } from "../ingest-effective-step"
import { DOCUMENT_PIPELINE_JOB_TYPES } from "./document-enqueue"
import type { JobType } from "./queue"

const SERIAL_INGEST_TYPES: JobType[] = [...DOCUMENT_PIPELINE_JOB_TYPES]
const STALE_RUNNING_MS = 2 * 60 * 1000
const PIPELINE_STAGES = ["uploaded", "parsing", "chunking", "embedding"] as const
const RECENT_WAVE_MS = 72 * 60 * 60 * 1000
const MAX_AUTO_RETRIES = 0
const STUCK_PROCESSING_MS = 3 * 60 * 1000

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
  /** ready na DB mas sem linhas em document_chunks */
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
  rag: IngestRagStats
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

/** Agrega total/embedded por documento (ready com chunks). */
export async function getEmbedStatusByDocument(
  userId: string
): Promise<Map<string, RagDocStatus>> {
  const { data: readyDocs, error } = await supabaseServer
    .from("subject_documents")
    .select("id")
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .in("ingest_stage", ["ready", "failed"])

  if (error) throw new Error(error.message)

  const ids = (readyDocs ?? []).map((d) => d.id as string)
  const perDoc = new Map<string, { total: number; embedded: number }>()
  for (const id of ids) perDoc.set(id, { total: 0, embedded: 0 })

  if (!ids.length) return new Map()

  let from = 0
  const pageSize = 2000
  while (true) {
    const { data: rows, error: chunkErr } = await supabaseServer
      .from("document_chunks")
      .select("document_id, embedding")
      .in("document_id", ids)
      .range(from, from + pageSize - 1)

    if (chunkErr) throw new Error(chunkErr.message)
    if (!rows?.length) break

    for (const row of rows) {
      const docId = row.document_id as string
      const s = perDoc.get(docId)
      if (!s) continue
      s.total++
      if (row.embedding != null) s.embedded++
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  const statusMap = new Map<string, RagDocStatus>()
  for (const [id, counts] of perDoc) {
    statusMap.set(id, ragStatusFromCounts(counts.total, counts.embedded))
  }
  return statusMap
}

export async function getRagStatsForUser(userId: string): Promise<IngestRagStats> {
  const statusMap = await getEmbedStatusByDocument(userId)
  let complete = 0
  let lexical_only = 0
  let partial = 0
  let need_chunk = 0

  for (const status of statusMap.values()) {
    if (status === "complete") complete++
    else if (status === "lexical_only") lexical_only++
    else if (status === "partial") partial++
    else if (status === "no_chunks") need_chunk++
  }

  return {
    complete,
    lexical_only,
    partial,
    need_embed: lexical_only + partial,
    need_chunk,
    total_with_chunks: complete + lexical_only + partial,
  }
}

/** Próximo da fila conforme modo (uploaded / chunk_backfill / embed / failed). */
export function pickNextPendingId(
  all: DocRow[],
  options?: {
    random?: boolean
    includeFailed?: boolean
    embedOnly?: boolean
    chunkBackfill?: boolean
    embedStatus?: Map<string, RagDocStatus>
  }
): string | null {
  const statusMap = options?.embedStatus ?? new Map()

  if (options?.chunkBackfill) {
    const needing = sortByQueue(
      all.filter((d) => {
        const st = statusMap.get(d.id)
        if (st !== "no_chunks") return false
        return d.ingest_stage === "ready" || d.ingest_stage === "failed"
      })
    )
    if (!needing.length) return null
    if (options?.random) {
      return needing[Math.floor(Math.random() * needing.length)]!.id
    }
    return needing[0]!.id
  }

  if (options?.embedOnly) {
    const needing = sortByQueue(
      all.filter((d) => {
        if (d.ingest_stage !== "ready") return false
        const st = statusMap.get(d.id)
        return st === "lexical_only" || st === "partial"
      })
    )
    if (!needing.length) return null
    if (options?.random) {
      return needing[Math.floor(Math.random() * needing.length)]!.id
    }
    return needing[0]!.id
  }

  const waiting = sortByQueue(
    all.filter((d) => d.ingest_stage === "uploaded")
  )
  if (waiting.length) {
    if (options?.random) {
      return waiting[Math.floor(Math.random() * waiting.length)]!.id
    }
    return waiting[0]!.id
  }

  const readyNoChunks = sortByQueue(
    all.filter(
      (d) =>
        d.ingest_stage === "ready" && statusMap.get(d.id) === "no_chunks"
    )
  )
  if (readyNoChunks.length) {
    if (options?.random) {
      return readyNoChunks[Math.floor(Math.random() * readyNoChunks.length)]!
        .id
    }
    return readyNoChunks[0]!.id
  }

  if (!options?.includeFailed) return null

  const failed = sortByQueue(all.filter((d) => d.ingest_stage === "failed"))
  if (!failed.length) return null
  if (options?.random) {
    return failed[Math.floor(Math.random() * failed.length)]!.id
  }
  return failed[0]!.id
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

/** PDFs presos (timeout Vercel) → pronto se já tem chunks, senão erro e sai da fila. */
export async function resetOrphanPipelineDocs(userId: string): Promise<number> {
  if (await userHasRunningDocumentJob(userId)) return 0

  const { data: stuck, error } = await supabaseServer
    .from("subject_documents")
    .select("id, parsed_tables, chunk_count")
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .in("ingest_stage", ["parsing", "chunking", "embedding"])

  if (error) throw new Error(error.message)
  let n = 0
  for (const row of stuck ?? []) {
    const docId = row.id as string
    if (await tryFinalizeReadyIfChunked(docId)) {
      n++
      continue
    }

    const pt = (row.parsed_tables ?? {}) as {
      processing_started_at?: string
    }
    const started = pt.processing_started_at
      ? new Date(pt.processing_started_at).getTime()
      : 0
    const stuckLong =
      !started || Date.now() - started > STUCK_PROCESSING_MS

    if (stuckLong) {
      await failDocumentIngest(
        docId,
        "Interrompido (timeout ou processamento cortado). Use Reindexar ou ↷ para pular."
      )
      n++
      continue
    }

    await supabaseServer
      .from("subject_documents")
      .update({
        ingest_stage: "uploaded",
        status: "pending",
        ingest_error: null,
        parsed_tables: pt,
      })
      .eq("id", docId)
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
  effective_step?: EffectiveIngestStep
  mode?: IngestProcessMode
  queue: IngestQueueDetails
}

export type RunIngestBatchResult = {
  processed: number
  ok: number
  failed: number
  last_error?: string | null
  summary_snapshot: Record<EffectiveIngestStep, number>
  stopped_reason: "idle" | "max_documents" | "max_seconds" | "cancelled" | "busy"
}

/**
 * Processa 1 PDF conforme effective_step (modo auto) ou modos legados.
 */
export async function processNextIngestDocument(
  userId: string,
  options?: {
    random?: boolean
    includeFailed?: boolean
    mode?: IngestProcessMode
    stepFilter?: EffectiveIngestStep
  }
): Promise<ProcessNextResult> {
  const mode = options?.mode ?? "auto"
  const useAuto = mode === "auto"
  const embedOnly = mode === "embed_only"
  const chunkBackfill = mode === "chunk_backfill"

  await healStaleRunningJobs(userId)
  await skipPendingIngestJobs(userId)
  if (useAuto || (!embedOnly && !chunkBackfill)) {
    await resetOrphanPipelineDocs(userId)
  }

  let targetId: string | null = null
  let statusItem: IngestStatusItem | null = null
  let doc: DocRow | undefined

  if (useAuto) {
    const items = await buildIngestStatusItems(userId)
    statusItem = pickNextStatusItem(items, {
      stepFilter: options?.stepFilter,
      random: options?.random,
    })
    targetId = statusItem?.id ?? null
    if (targetId) {
      const all = await fetchAllStudyDocs(userId)
      doc = all.find((d) => d.id === targetId)
    }
  } else {
    const all = await fetchAllStudyDocs(userId)
    const embedStatus =
      embedOnly || chunkBackfill || mode === "full"
        ? await getEmbedStatusByDocument(userId)
        : undefined

    targetId = pickNextPendingId(all, {
      random: options?.random,
      includeFailed: options?.includeFailed && !chunkBackfill,
      embedOnly,
      chunkBackfill,
      embedStatus,
    })
    doc = targetId ? all.find((d) => d.id === targetId) : undefined
  }

  if (!targetId || !doc) {
    return {
      status: "idle",
      mode,
      queue: await readIngestQueueDetails(userId),
    }
  }

  const embedSteps: EffectiveIngestStep[] = ["needs_embed", "rag_partial"]
  const shouldEmbedOnly = useAuto
    ? embedSteps.includes(statusItem!.effective_step)
    : embedOnly

  if (
    !useAuto &&
    !shouldEmbedOnly &&
    !chunkBackfill &&
    doc.ingest_stage === "failed"
  ) {
    await requeueDocumentForIngest(userId, targetId)
  }

  if (shouldEmbedOnly) {
    await supabaseServer
      .from("subject_documents")
      .update({
        ingest_stage: "embedding",
        status: "processing",
        ingest_error: null,
      })
      .eq("id", targetId)
  } else {
    await markProcessingStarted(userId, targetId)
  }

  try {
    if (shouldEmbedOnly) {
      const result = await embedOnlyDocument(userId, targetId)
      return {
        status: "ready",
        mode,
        effective_step: statusItem?.effective_step,
        document_id: targetId,
        title: doc.title,
        chunks: result.chunks,
        embedded: result.embedded,
        queue: await readIngestQueueDetails(userId),
      }
    }

    const result = await ingestDocumentPipelineWithTimeout(userId, targetId)
    return {
      status: "ready",
      mode,
      effective_step: statusItem?.effective_step,
      document_id: targetId,
      title: doc.title,
      chunks: result.chunks,
      embedded: result.embedded,
      queue: await readIngestQueueDetails(userId),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na indexação"
    const timedOut = isIngestTimeoutError(e)

    if (!shouldEmbedOnly && (await tryFinalizeReadyIfChunked(targetId))) {
      const counts = await getChunkEmbedCounts(targetId)
      return {
        status: "ready",
        mode,
        effective_step: statusItem?.effective_step,
        document_id: targetId,
        title: doc.title,
        chunks: counts.total,
        embedded: counts.embedded,
        error: "Concluído com busca lexical (vetorização parcial).",
        queue: await readIngestQueueDetails(userId),
      }
    }

    const failMsg = timedOut
      ? "PDF muito grande para processar de uma vez (timeout). Configure a VPS para indexação ou divida o arquivo."
      : msg

    if (!shouldEmbedOnly || !msg.includes("Configure chave OpenAI")) {
      await failDocumentIngest(targetId, failMsg)
    }
    return {
      status: "failed",
      mode,
      effective_step: statusItem?.effective_step,
      document_id: targetId,
      title: doc.title,
      error: failMsg,
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

  const failedAll = sortByQueue(all.filter((d) => d.ingest_stage === "failed"))

  const completed = wave.filter((d) => d.ingest_stage === "ready").length
  const total = wave.length
  const running = false

  const waiting = sortByQueue(all.filter((d) => d.ingest_stage === "uploaded"))
  const pending_count = waiting.length

  const rag = await getRagStatsForUser(userId)

  const active =
    pending_count > 0 ||
    running ||
    failedAll.length > 0 ||
    completed < total ||
    rag.need_embed > 0 ||
    rag.need_chunk > 0

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
      rag,
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

  const failed_items = failedAll.slice(0, 10).map((d) =>
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
    failed_count: failedAll.length,
    rag,
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
