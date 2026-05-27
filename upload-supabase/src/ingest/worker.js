/** Sync com lib/ai/jobs/document-ingest-worker.ts — pipeline sem timeout Vercel. */
import {
  embedOnlyDocument,
  failDocumentIngest,
  getChunkEmbedCounts,
  ingestDocumentPipeline,
  isIngestTimeoutError,
  markProcessingStarted,
  ragStatusFromCounts,
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

export async function getEmbedStatusByDocument(supabase, userId) {
  const { data: readyDocs, error } = await supabase
    .from("subject_documents")
    .select("id")
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .eq("ingest_stage", "ready")

  if (error) throw new Error(error.message)

  const ids = (readyDocs ?? []).map((d) => d.id)
  const perDoc = new Map()
  for (const id of ids) perDoc.set(id, { total: 0, embedded: 0 })

  if (!ids.length) return new Map()

  let from = 0
  const pageSize = 2000
  while (true) {
    const { data: rows, error: chunkErr } = await supabase
      .from("document_chunks")
      .select("document_id, embedding")
      .in("document_id", ids)
      .range(from, from + pageSize - 1)

    if (chunkErr) throw new Error(chunkErr.message)
    if (!rows?.length) break

    for (const row of rows) {
      const s = perDoc.get(row.document_id)
      if (!s) continue
      s.total++
      if (row.embedding != null) s.embedded++
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  const statusMap = new Map()
  for (const [id, counts] of perDoc) {
    statusMap.set(id, ragStatusFromCounts(counts.total, counts.embedded))
  }
  return statusMap
}

export async function getRagStatsForUser(supabase, userId) {
  const statusMap = await getEmbedStatusByDocument(supabase, userId)
  let complete = 0
  let lexical_only = 0
  let partial = 0

  for (const status of statusMap.values()) {
    if (status === "complete") complete++
    else if (status === "lexical_only") lexical_only++
    else if (status === "partial") partial++
  }

  let need_chunk = 0
  for (const status of statusMap.values()) {
    if (status === "no_chunks") need_chunk++
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

export function pickNextPendingId(all, options) {
  const statusMap = options?.embedStatus ?? new Map()

  if (options?.chunkBackfill) {
    const needing = sortByQueue(
      all.filter(
        (d) =>
          d.ingest_stage === "ready" && statusMap.get(d.id) === "no_chunks"
      )
    )
    if (!needing.length) return null
    if (options?.random) {
      return needing[Math.floor(Math.random() * needing.length)].id
    }
    return needing[0].id
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
      return needing[Math.floor(Math.random() * needing.length)].id
    }
    return needing[0].id
  }

  const waiting = sortByQueue(all.filter((d) => d.ingest_stage === "uploaded"))
  if (waiting.length) {
    if (options?.random) {
      return waiting[Math.floor(Math.random() * waiting.length)].id
    }
    return waiting[0].id
  }

  const readyNoChunks = sortByQueue(
    all.filter(
      (d) =>
        d.ingest_stage === "ready" && statusMap.get(d.id) === "no_chunks"
    )
  )
  if (readyNoChunks.length) {
    if (options?.random) {
      return readyNoChunks[Math.floor(Math.random() * readyNoChunks.length)].id
    }
    return readyNoChunks[0].id
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

  const rag = await getRagStatsForUser(supabase, userId)

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
    rag,
  }
}

/**
 * Processa o próximo PDF da fila (pipeline completa na VPS).
 */
export async function processNextIngestDocument(supabase, config, userId, options) {
  const mode =
    options?.mode === "embed_only"
      ? "embed_only"
      : options?.mode === "chunk_backfill"
        ? "chunk_backfill"
        : "full"
  const embedOnly = mode === "embed_only"
  const chunkBackfill = mode === "chunk_backfill"

  if (usersProcessing.has(userId)) {
    return {
      status: "retry",
      error: "Já há um PDF sendo indexado. Aguarde.",
      mode,
      queue: await readIngestQueueDetails(supabase, userId),
    }
  }

  usersProcessing.add(userId)
  try {
    await healStaleRunningJobs(supabase, userId)
    await skipPendingIngestJobs(supabase, userId)
    if (!embedOnly && !chunkBackfill) await resetOrphanPipelineDocs(supabase, userId)

    const all = await fetchAllStudyDocs(supabase, userId)
    const embedStatus =
      embedOnly || chunkBackfill || mode === "full"
        ? await getEmbedStatusByDocument(supabase, userId)
        : undefined

    const targetId = pickNextPendingId(all, {
      random: options?.random,
      includeFailed: options?.includeFailed && !chunkBackfill,
      embedOnly,
      chunkBackfill,
      embedStatus,
    })

    if (!targetId) {
      return {
        status: "idle",
        mode,
        queue: await readIngestQueueDetails(supabase, userId),
      }
    }

    const doc = all.find((d) => d.id === targetId)
    if (!embedOnly && !chunkBackfill && doc?.ingest_stage === "failed") {
      await requeueDocumentForIngest(supabase, userId, targetId)
    }

    if (embedOnly) {
      await supabase
        .from("subject_documents")
        .update({
          ingest_stage: "embedding",
          status: "processing",
          ingest_error: null,
        })
        .eq("id", targetId)
    } else {
      await markProcessingStarted(supabase, userId, targetId)
    }

    try {
      if (embedOnly) {
        const result = await embedOnlyDocument(
          supabase,
          config,
          userId,
          targetId
        )
        return {
          status: "ready",
          mode,
          document_id: targetId,
          title: doc.title,
          chunks: result.chunks,
          embedded: result.embedded,
          queue: await readIngestQueueDetails(supabase, userId),
        }
      }

      const result = await ingestDocumentPipeline(
        supabase,
        config,
        userId,
        targetId
      )
      return {
        status: "ready",
        mode,
        document_id: targetId,
        title: doc.title,
        chunks: result.chunks,
        embedded: result.embedded,
        queue: await readIngestQueueDetails(supabase, userId),
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro na indexação"
      const timedOut = isIngestTimeoutError(e)

      if (!embedOnly && (await tryFinalizeReadyIfChunked(supabase, targetId))) {
        const counts = await getChunkEmbedCounts(supabase, targetId)
        return {
          status: "ready",
          mode,
          document_id: targetId,
          title: doc.title,
          chunks: counts.total,
          embedded: counts.embedded,
          error: "Concluído com busca lexical (vetorização parcial).",
          queue: await readIngestQueueDetails(supabase, userId),
        }
      }

      const failMsg = timedOut
        ? "PDF muito grande para extrair no tempo limite. Aumente INGEST_PDF_TIMEOUT_MS na VPS ou divida o arquivo."
        : msg

      if (!embedOnly || !msg.includes("Configure chave OpenAI")) {
        await failDocumentIngest(supabase, targetId, failMsg)
      }
      return {
        status: "failed",
        mode,
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
