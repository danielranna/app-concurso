import { supabaseServer } from "../../supabase-server"
import {
  DOCUMENT_PIPELINE_JOB_TYPES,
  enqueueMaterialParse,
} from "./document-enqueue"
import type { JobType } from "./queue"
import { runJobWorker } from "./worker"

const SERIAL_INGEST_TYPES: JobType[] = [...DOCUMENT_PIPELINE_JOB_TYPES]
const STALE_RUNNING_MS = 12 * 60 * 1000
const PIPELINE_STAGES = ["uploaded", "parsing", "chunking", "embedding"] as const

export type IngestQueueItemView = {
  id: string
  title: string
  subject_id: string | null
  subject_name: string | null
  ingest_stage: string
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

/** Jobs travados em running (timeout serverless) voltam para pending. */
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
    .select("id")

  if (e2) throw new Error(e2.message)
  healed += orphanRunning?.length ?? 0

  return healed
}

/** PDF enviado sem job na fila — recoloca parse. */
export async function ensureParseJobsEnqueued(userId: string): Promise<number> {
  const { data: docs, error } = await supabaseServer
    .from("subject_documents")
    .select("id, ingest_stage")
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .in("ingest_stage", ["uploaded", "failed"])

  if (error) throw new Error(error.message)

  let enqueued = 0
  for (const doc of docs ?? []) {
    const documentId = doc.id as string
    const stage = doc.ingest_stage as string
    const parseKey = `parse:${documentId}:v1`

    const { data: parseJob } = await supabaseServer
      .from("ai_jobs")
      .select("id, status")
      .eq("user_id", userId)
      .eq("idempotency_key", parseKey)
      .maybeSingle()

    if (parseJob?.status === "pending" || parseJob?.status === "running") {
      continue
    }

    const needsForce =
      stage === "failed" ||
      parseJob?.status === "failed" ||
      parseJob?.status === "done"

    if (!parseJob || needsForce) {
      await enqueueMaterialParse(userId, documentId, {
        force: needsForce,
      })
      enqueued++
    }
  }

  return enqueued
}

export async function healIngestPipeline(userId: string) {
  const [stale, enqueued] = await Promise.all([
    healStaleRunningJobs(userId),
    ensureParseJobsEnqueued(userId),
  ])
  return { stale, enqueued }
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

export async function countPendingMaterialIngest(userId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from("subject_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .in("ingest_stage", [...PIPELINE_STAGES])

  if (error) throw new Error(error.message)
  return count ?? 0
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

export async function getIngestQueueDetails(
  userId: string,
  options?: { itemLimit?: number }
): Promise<IngestQueueDetails> {
  await healIngestPipeline(userId)

  const itemLimit = options?.itemLimit ?? 5

  const { data: docs, error } = await supabaseServer
    .from("subject_documents")
    .select(
      "id, title, ingest_stage, subject_id, created_at, last_ingested_at, subjects(name)"
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

  if (!pipeline.length) {
    return {
      active: running,
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

  const batchStart = pipeline[0]!.created_at
  const completedInBatch = all.filter(
    (d) =>
      d.ingest_stage === "ready" &&
      new Date(d.created_at).getTime() >= new Date(batchStart).getTime()
  )

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

  const total = pipeline.length + completedInBatch.length
  const completed = completedInBatch.length

  return {
    active: true,
    running,
    pending_count: pipeline.length,
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
  await healIngestPipeline(userId)

  if (await userHasRunningDocumentJob(userId)) {
    return { processed: 0, skipped: "already_running" as const, results: [] }
  }

  const pendingDocs = await countPendingMaterialIngest(userId)
  if (pendingDocs === 0) {
    const { data: pendingJobs } = await supabaseServer
      .from("ai_jobs")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .in("job_type", SERIAL_INGEST_TYPES)
      .limit(1)
    if (!pendingJobs?.length) {
      return { processed: 0, skipped: "nothing_pending" as const, results: [] }
    }
  }

  const results = await runJobWorker(1, {
    userId,
    jobTypes: SERIAL_INGEST_TYPES,
  })

  return { processed: results.length, skipped: null, results }
}

export { SERIAL_INGEST_TYPES }
