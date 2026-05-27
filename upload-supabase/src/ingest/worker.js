/** Sync com lib/ai/jobs/document-ingest-worker.ts — pipeline sem timeout Vercel. */
import {
  failDocumentIngest,
  ingestDocumentPipeline,
  isIngestTimeoutError,
  markProcessingStarted,
  tryFinalizeReadyIfChunked,
} from "./pipeline.js"

const SERIAL_INGEST_TYPES = [
  "document_parse",
  "document_chunk",
  "document_embed",
  "document_ingest",
  "document_batch_ingest",
]

const STALE_RUNNING_MS = 2 * 60 * 1000
const PIPELINE_STAGES = ["uploaded", "parsing", "chunking", "embedding"]
const RECENT_WAVE_MS = 72 * 60 * 60 * 1000
const STUCK_PROCESSING_MS = 3 * 60 * 1000

/** Evita dois process-next simultâneos para o mesmo usuário na mesma instância. */
const usersProcessing = new Set()

function subjectNameFromRow(row) {
  const s = row.subjects
  if (!s) return null
  if (Array.isArray(s)) return s[0]?.name ?? null
  return s.name ?? null
}

function isRecentWaveDoc(d) {
  const created = new Date(d.created_at).getTime()
  const ingested = d.last_ingested_at
    ? new Date(d.last_ingested_at).getTime()
    : 0
  return Date.now() - Math.max(created, ingested) < RECENT_WAVE_MS
}

function queueSortTime(d) {
  const pt = d.parsed_tables ?? {}
  if (pt.queue_sort_at) return new Date(pt.queue_sort_at).getTime()
  return new Date(d.created_at).getTime()
}

function sortByQueue(docs) {
  return [...docs].sort((a, b) => queueSortTime(a) - queueSortTime(b))
}

export function pickNextPendingId(all, options) {
  const waiting = sortByQueue(all.filter((d) => d.ingest_stage === "uploaded"))
  if (waiting.length) {
    if (options?.random) {
      return waiting[Math.floor(Math.random() * waiting.length)].id
    }
    return waiting[0].id
  }

  if (!options?.includeFailed) return null

  const failed = sortByQueue(all.filter((d) => d.ingest_stage === "failed"))
  if (!failed.length) return null
  if (options?.random) {
    return failed[Math.floor(Math.random() * failed.length)].id
  }
  return failed[0].id
}

async function requeueDocumentForIngest(supabase, userId, documentId) {
  const { data: doc, error } = await supabase
    .from("subject_documents")
    .select("parsed_tables")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !doc) throw new Error(error?.message ?? "Documento não encontrado")

  const pt = doc.parsed_tables ?? {}
  await supabase
    .from("subject_documents")
    .update({
      ingest_stage: "uploaded",
      status: "pending",
      ingest_error: null,
      parsed_tables: { ...pt, ingest_retries: 0 },
    })
    .eq("id", documentId)
}

async function healStaleRunningJobs(supabase, userId) {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString()

  await supabase
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

  const orphanCutoff = new Date(Date.now() - 90 * 1000).toISOString()
  await supabase
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
}

async function userHasRunningDocumentJob(supabase, userId) {
  const { data } = await supabase
    .from("ai_jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "running")
    .in("job_type", SERIAL_INGEST_TYPES)
    .limit(1)
    .maybeSingle()

  return Boolean(data?.id)
}

export async function resetOrphanPipelineDocs(supabase, userId) {
  if (await userHasRunningDocumentJob(supabase, userId)) return 0

  const { data: stuck, error } = await supabase
    .from("subject_documents")
    .select("id, parsed_tables, chunk_count")
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .in("ingest_stage", ["parsing", "chunking", "embedding"])

  if (error) throw new Error(error.message)
  let n = 0
  for (const row of stuck ?? []) {
    const docId = row.id
    if (await tryFinalizeReadyIfChunked(supabase, docId)) {
      n++
      continue
    }

    const pt = row.parsed_tables ?? {}
    const started = pt.processing_started_at
      ? new Date(pt.processing_started_at).getTime()
      : 0
    const stuckLong =
      !started || Date.now() - started > STUCK_PROCESSING_MS

    if (stuckLong) {
      await failDocumentIngest(
        supabase,
        docId,
        "Interrompido (timeout ou processamento cortado). Use Reindexar ou ↷ para pular."
      )
      n++
      continue
    }

    await supabase
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

async function skipPendingIngestJobs(supabase, userId) {
  await supabase
    .from("ai_jobs")
    .update({
      status: "skipped",
      error_message: "Processamento manual (botão / VPS)",
      completed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("job_type", SERIAL_INGEST_TYPES)
}

async function fetchAllStudyDocs(supabase, userId) {
  const { data, error } = await supabase
    .from("subject_documents")
    .select(
      "id, title, ingest_stage, ingest_error, page_count, subject_id, created_at, last_ingested_at, parsed_tables, subjects(name)"
    )
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

function toView(d, flags) {
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

export async function readIngestQueueDetails(supabase, userId, options) {
  const itemLimit = options?.itemLimit ?? 5
  const all = await fetchAllStudyDocs(supabase, userId)

  const wave = all.filter(
    (d) =>
      d.ingest_stage !== "failed" &&
      (PIPELINE_STAGES.includes(d.ingest_stage ?? "") ||
        (d.ingest_stage === "ready" && isRecentWaveDoc(d)))
  )

  const failedAll = sortByQueue(all.filter((d) => d.ingest_stage === "failed"))

  const completed = wave.filter((d) => d.ingest_stage === "ready").length
  const total = wave.length
  const running = usersProcessing.has(userId)

  const waiting = sortByQueue(all.filter((d) => d.ingest_stage === "uploaded"))
  const pending_count = waiting.length

  const active =
    pending_count > 0 || running || failedAll.length > 0 || completed < total

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
    current: running && nextDoc ? toView(nextDoc, { is_current: true, is_next: false }) : null,
    next,
    items,
    has_more: waiting.length > itemLimit + 1,
    failed_items,
    failed_count: failedAll.length,
  }
}

/**
 * Processa o próximo PDF da fila (pipeline completa na VPS).
 */
export async function processNextIngestDocument(supabase, config, userId, options) {
  if (usersProcessing.has(userId)) {
    return {
      status: "retry",
      error: "Já há um PDF sendo indexado. Aguarde.",
      queue: await readIngestQueueDetails(supabase, userId),
    }
  }

  usersProcessing.add(userId)
  try {
    await healStaleRunningJobs(supabase, userId)
    await skipPendingIngestJobs(supabase, userId)
    await resetOrphanPipelineDocs(supabase, userId)

    const all = await fetchAllStudyDocs(supabase, userId)
    const targetId = pickNextPendingId(all, options)

    if (!targetId) {
      return {
        status: "idle",
        queue: await readIngestQueueDetails(supabase, userId),
      }
    }

    const doc = all.find((d) => d.id === targetId)
    if (doc?.ingest_stage === "failed") {
      await requeueDocumentForIngest(supabase, userId, targetId)
    }

    await markProcessingStarted(supabase, userId, targetId)

    try {
      const result = await ingestDocumentPipeline(
        supabase,
        config,
        userId,
        targetId
      )
      return {
        status: "ready",
        document_id: targetId,
        title: doc.title,
        chunks: result.chunks,
        queue: await readIngestQueueDetails(supabase, userId),
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro na indexação"
      const timedOut = isIngestTimeoutError(e)

      if (await tryFinalizeReadyIfChunked(supabase, targetId)) {
        return {
          status: "ready",
          document_id: targetId,
          title: doc.title,
          error: "Concluído com busca lexical (vetorização parcial).",
          queue: await readIngestQueueDetails(supabase, userId),
        }
      }

      const failMsg = timedOut
        ? "PDF muito grande para extrair no tempo limite. Aumente INGEST_PDF_TIMEOUT_MS na VPS ou divida o arquivo."
        : msg

      await failDocumentIngest(supabase, targetId, failMsg)
      return {
        status: "failed",
        document_id: targetId,
        title: doc.title,
        error: failMsg,
        queue: await readIngestQueueDetails(supabase, userId),
      }
    }
  } finally {
    usersProcessing.delete(userId)
  }
}
