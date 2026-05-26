import { supabaseServer } from "../../supabase-server"
import { loadDocumentText } from "../document-ingest"
import {
  DOCUMENT_PIPELINE_JOB_TYPES,
  enqueueMaterialParse,
} from "./document-enqueue"
import { enqueueJob, type JobType } from "./queue"
import { runJobWorker } from "./worker"

const SERIAL_INGEST_TYPES: JobType[] = [...DOCUMENT_PIPELINE_JOB_TYPES]
const STALE_RUNNING_MS = 2 * 60 * 1000
const PIPELINE_STAGES = ["uploaded", "parsing", "chunking", "embedding"] as const
const RECENT_WAVE_MS = 72 * 60 * 60 * 1000
const MAX_PARSE_ENQUEUE_PER_HEAL = 8

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
  const t = Math.max(created, ingested)
  return Date.now() - t < RECENT_WAVE_MS
}

export async function healStaleRunningJobs(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString()
  let healed = 0

  const { data: staleStarted, error: e1 } = await supabaseServer
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

  if (e1) throw new Error(e1.message)
  healed += staleStarted?.length ?? 0

  const orphanCutoff = new Date(Date.now() - 90 * 1000).toISOString()
  const { data: orphanRunning, error: e2 } = await supabaseServer
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

  if (e2) throw new Error(e2.message)
  healed += orphanRunning?.length ?? 0

  return healed
}

async function listActivePipelineJobs(userId: string) {
  const { data, error } = await supabaseServer
    .from("ai_jobs")
    .select("id, payload, status, job_type, idempotency_key")
    .eq("user_id", userId)
    .in("status", ["pending", "running"])
    .in("job_type", SERIAL_INGEST_TYPES)

  if (error) throw new Error(error.message)
  return data ?? []
}

function jobTargetsDocument(
  jobs: { payload: Record<string, unknown> | null }[],
  documentId: string
) {
  return jobs.some(
    (j) => (j.payload as { document_id?: string })?.document_id === documentId
  )
}

export async function healStuckPipelineDocuments(userId: string): Promise<number> {
  const { data: docs, error } = await supabaseServer
    .from("subject_documents")
    .select("id, ingest_stage, parsed_tables")
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .in("ingest_stage", ["parsing", "chunking", "embedding"])
    .limit(20)

  if (error) throw new Error(error.message)
  if (!docs?.length) return 0

  const activeJobs = await listActivePipelineJobs(userId)
  let healed = 0

  for (const doc of docs) {
    const documentId = doc.id as string
    if (jobTargetsDocument(activeJobs, documentId)) continue

    const stage = doc.ingest_stage as string

    if (stage === "parsing") {
      try {
        const text = await loadDocumentText(documentId)
        if (text.trim().length >= 80) {
          await supabaseServer
            .from("subject_documents")
            .update({
              ingest_stage: "chunking",
              status: "processing",
              ingest_error: null,
            })
            .eq("id", documentId)
          await enqueueJob({
            userId,
            jobType: "document_chunk",
            idempotencyKey: `chunk:${documentId}:recover:${Date.now()}`,
            payload: { document_id: documentId },
            priority: 5,
          })
          healed++
          continue
        }
      } catch {
        /* reinício */
      }
    }

    const pt = (doc.parsed_tables ?? {}) as { ingest_retries?: number }
    const retries = Number(pt.ingest_retries ?? 0)

    if (retries >= 2) {
      await supabaseServer
        .from("subject_documents")
        .update({
          ingest_stage: "failed",
          status: "failed",
          ingest_error:
            "Não foi possível indexar (PDF muito grande ou travou várias vezes). Divida o arquivo ou use Reindexar.",
        })
        .eq("id", documentId)
      healed++
      continue
    }

    await supabaseServer
      .from("subject_documents")
      .update({
        ingest_stage: "uploaded",
        status: "pending",
        ingest_error: "Reiniciando após travamento…",
        parsed_tables: { ...pt, ingest_retries: retries + 1 },
      })
      .eq("id", documentId)

    await enqueueMaterialParse(userId, documentId, { force: true })
    healed++
  }

  return healed
}

/** Uma query de jobs + no máximo N enfileiramentos por ciclo (evita 100+ GET no Supabase). */
export async function ensureParseJobsEnqueued(userId: string): Promise<number> {
  const { data: docs, error } = await supabaseServer
    .from("subject_documents")
    .select("id")
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .eq("ingest_stage", "uploaded")
    .order("created_at", { ascending: true })
    .limit(100)

  if (error) throw new Error(error.message)
  if (!docs?.length) return 0

  const { data: jobs, error: jobsErr } = await supabaseServer
    .from("ai_jobs")
    .select("idempotency_key, status, payload")
    .eq("user_id", userId)
    .in("job_type", ["document_parse", "document_chunk", "document_embed", "document_ingest"])
    .in("status", ["pending", "running", "done"])

  if (jobsErr) throw new Error(jobsErr.message)

  const busyDocIds = new Set<string>()
  for (const job of jobs ?? []) {
    if (job.status === "pending" || job.status === "running") {
      const docId = (job.payload as { document_id?: string })?.document_id
      if (docId) busyDocIds.add(docId)
    }
  }

  const doneParseKeys = new Set(
    (jobs ?? [])
      .filter(
        (j) =>
          j.status === "done" &&
          typeof j.idempotency_key === "string" &&
          j.idempotency_key.startsWith("parse:")
      )
      .map((j) => j.idempotency_key as string)
  )

  let enqueued = 0
  for (const doc of docs) {
    if (enqueued >= MAX_PARSE_ENQUEUE_PER_HEAL) break
    const documentId = doc.id as string
    if (busyDocIds.has(documentId)) continue

    const parseKey = `parse:${documentId}:v1`
    if (doneParseKeys.has(parseKey)) {
      await enqueueMaterialParse(userId, documentId, { force: true })
      enqueued++
      continue
    }

    await enqueueMaterialParse(userId, documentId)
    enqueued++
  }

  return enqueued
}

export async function healIngestPipeline(userId: string) {
  const [stale, stuck, enqueued] = await Promise.all([
    healStaleRunningJobs(userId),
    healStuckPipelineDocuments(userId),
    ensureParseJobsEnqueued(userId),
  ])
  return { stale, stuck, enqueued }
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

function sortPipelineDocs(docs: DocRow[]): DocRow[] {
  const stageRank: Record<string, number> = {
    parsing: 0,
    chunking: 1,
    embedding: 2,
    uploaded: 3,
  }
  return [...docs].sort((a, b) => {
    const ra = stageRank[a.ingest_stage ?? ""] ?? 9
    const rb = stageRank[b.ingest_stage ?? ""] ?? 9
    if (ra !== rb) return ra - rb
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

/** Só leitura — fila = PDFs na DB com ingest_stage (sem heal, sem centenas de queries). */
export async function readIngestQueueDetails(
  userId: string,
  options?: { itemLimit?: number }
): Promise<IngestQueueDetails> {
  const itemLimit = options?.itemLimit ?? 5

  const { data: docs, error } = await supabaseServer
    .from("subject_documents")
    .select(
      "id, title, ingest_stage, ingest_error, page_count, subject_id, created_at, last_ingested_at, subjects(name)"
    )
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  const all = (docs ?? []) as DocRow[]
  const pipeline = all.filter((d) =>
    PIPELINE_STAGES.includes(
      (d.ingest_stage ?? "") as (typeof PIPELINE_STAGES)[number]
    )
  )

  const running = await userHasRunningDocumentJob(userId)

  const wave = all.filter(
    (d) =>
      d.ingest_stage !== "failed" &&
      (PIPELINE_STAGES.includes(
        (d.ingest_stage ?? "") as (typeof PIPELINE_STAGES)[number]
      ) ||
        (d.ingest_stage === "ready" && isRecentWaveDoc(d)))
  )

  const completed = wave.filter((d) => d.ingest_stage === "ready").length
  const total = wave.length
  const pending_count = pipeline.length

  const active = pending_count > 0 || running || (total > completed && completed < total)

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
    }
  }

  if (!pipeline.length) {
    return {
      active: true,
      running,
      pending_count: 0,
      completed,
      total,
      current: null,
      next: null,
      items: [],
      has_more: false,
    }
  }

  const sorted = sortPipelineDocs(pipeline)
  const currentDoc =
    sorted.find((d) =>
      ["parsing", "chunking", "embedding"].includes(d.ingest_stage ?? "")
    ) ?? sorted[0]!
  const currentIdx = sorted.findIndex((d) => d.id === currentDoc.id)
  const nextDoc = sorted[currentIdx + 1] ?? null

  const toView = (d: DocRow, flags: { is_current: boolean; is_next: boolean }) =>
    ({
      id: d.id,
      title: d.title,
      subject_id: d.subject_id,
      subject_name: subjectNameFromRow(d),
      ingest_stage: d.ingest_stage ?? "uploaded",
      ingest_error: d.ingest_error,
      page_count: d.page_count,
      created_at: d.created_at,
      is_current: flags.is_current,
      is_next: flags.is_next,
    }) satisfies IngestQueueItemView

  const items = sorted.slice(0, itemLimit).map((d) =>
    toView(d, {
      is_current: d.id === currentDoc.id,
      is_next: nextDoc ? d.id === nextDoc.id : false,
    })
  )

  return {
    active: true,
    running,
    pending_count,
    completed,
    total,
    current: toView(currentDoc, { is_current: true, is_next: false }),
    next: nextDoc
      ? toView(nextDoc, { is_current: false, is_next: true })
      : null,
    items,
    has_more: sorted.length > itemLimit,
  }
}

export async function runSerialDocumentIngestWorker(userId: string) {
  if (await userHasRunningDocumentJob(userId)) {
    const queue = await readIngestQueueDetails(userId)
    return {
      processed: 0,
      skipped: "already_running" as const,
      results: [],
      queue,
    }
  }

  await healIngestPipeline(userId)

  const results = await runJobWorker(1, {
    userId,
    jobTypes: SERIAL_INGEST_TYPES,
  })

  const queue = await readIngestQueueDetails(userId)
  const skipped =
    results.length === 0 && !queue.running && queue.pending_count === 0
      ? ("idle" as const)
      : null

  return { processed: results.length, skipped, results, queue }
}

export { SERIAL_INGEST_TYPES }
