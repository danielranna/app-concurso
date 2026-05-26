import { supabaseServer } from "../../supabase-server"
import { failDocumentIngest } from "../document-ingest"
import {
  DOCUMENT_PIPELINE_JOB_TYPES,
  enqueueMaterialIngest,
} from "./document-enqueue"
import { claimHeadIngestJob, type JobType } from "./queue"
import { processJob } from "./worker"

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

function sortByCreated(docs: DocRow[]) {
  return [...docs].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

/** Cabeça da fila: o único que pode estar em parsing/chunking/embedding. */
export function pickQueueHeadId(all: DocRow[]): string | null {
  const inProgress = sortByCreated(
    all.filter((d) =>
      ["parsing", "chunking", "embedding"].includes(d.ingest_stage ?? "")
    )
  )
  if (inProgress.length) return inProgress[0]!.id

  const waiting = sortByCreated(
    all.filter((d) => d.ingest_stage === "uploaded")
  )
  return waiting[0]?.id ?? null
}

function docPayloadId(payload: unknown): string | null {
  const p = payload as { document_id?: string } | null
  return p?.document_id ?? null
}

/** Só 1 PDF ativo; demais voltam para uploaded e jobs pendentes são ignorados. */
export async function enforceSerialQueue(
  userId: string,
  allDocs: DocRow[]
): Promise<string | null> {
  const headId = pickQueueHeadId(allDocs)
  if (!headId) return null

  const othersInPipeline = allDocs.filter(
    (d) =>
      d.id !== headId &&
      ["parsing", "chunking", "embedding"].includes(d.ingest_stage ?? "")
  )

  for (const doc of othersInPipeline) {
    await supabaseServer
      .from("subject_documents")
      .update({
        ingest_stage: "uploaded",
        status: "pending",
        ingest_error: null,
      })
      .eq("id", doc.id)
  }

  const { data: pendingJobs } = await supabaseServer
    .from("ai_jobs")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("job_type", SERIAL_INGEST_TYPES)

  for (const job of pendingJobs ?? []) {
    const docId = docPayloadId(job.payload)
    if (docId && docId !== headId) {
      await supabaseServer
        .from("ai_jobs")
        .update({
          status: "skipped",
          error_message: "Aguardando vez na fila serial",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
    }
  }

  return headId
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

async function headHasActiveIngestJob(
  userId: string,
  headDocumentId: string
): Promise<boolean> {
  const { data: jobs } = await supabaseServer
    .from("ai_jobs")
    .select("id, status, payload")
    .eq("user_id", userId)
    .eq("job_type", "document_ingest")
    .in("status", ["pending", "running"])

  return (jobs ?? []).some(
    (j) => docPayloadId(j.payload) === headDocumentId
  )
}

/** Só enfileira job para o primeiro da fila (nunca vários de uma vez). */
export async function ensureHeadIngestJob(
  userId: string,
  headDocumentId: string,
  headStage: string
): Promise<boolean> {
  if (await headHasActiveIngestJob(userId, headDocumentId)) return false
  if (headStage !== "uploaded") return false
  await enqueueMaterialIngest(userId, headDocumentId)
  return true
}

export async function healHeadDocument(
  userId: string,
  headId: string,
  headDoc: DocRow
): Promise<void> {
  const stage = headDoc.ingest_stage ?? "uploaded"
  const activeJobs = await supabaseServer
    .from("ai_jobs")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["pending", "running"])
    .in("job_type", SERIAL_INGEST_TYPES)

  const hasJob = (activeJobs.data ?? []).length > 0
  if (hasJob) return

  if (["parsing", "chunking", "embedding"].includes(stage)) {
    const pt = (headDoc.parsed_tables ?? {}) as { ingest_retries?: number }
    const retries = Number(pt.ingest_retries ?? 0)

    if (retries >= MAX_AUTO_RETRIES) {
      await failDocumentIngest(
        headId,
        "Não foi possível indexar após novas tentativas. Divida o PDF ou use Reindexar."
      )
      return
    }

    await supabaseServer
      .from("subject_documents")
      .update({
        ingest_stage: "uploaded",
        status: "pending",
        ingest_error: "Nova tentativa automática…",
        parsed_tables: { ...pt, ingest_retries: retries + 1 },
      })
      .eq("id", headId)

    await enqueueMaterialIngest(userId, headId, { force: true })
  }
}

export async function healIngestPipeline(
  userId: string,
  allDocs: DocRow[]
): Promise<{ headId: string | null }> {
  await healStaleRunningJobs(userId)
  const headId = await enforceSerialQueue(userId, allDocs)
  if (headId) {
    const headDoc = allDocs.find((d) => d.id === headId)
    if (headDoc) {
      await healHeadDocument(userId, headId, headDoc)
      await ensureHeadIngestJob(userId, headId, headDoc.ingest_stage ?? "uploaded")
    }
  }
  return { headId }
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

  const failedRecent = sortByCreated(
    all.filter((d) => d.ingest_stage === "failed" && isRecentWaveDoc(d))
  )

  const completed = wave.filter((d) => d.ingest_stage === "ready").length
  const total = wave.length
  const running = await userHasRunningDocumentJob(userId)
  const headId = pickQueueHeadId(all)

  const waiting = sortByCreated(
    all.filter((d) => d.ingest_stage === "uploaded" && d.id !== headId)
  )

  const pending_count =
    waiting.length + (headId && all.find((d) => d.id === headId)?.ingest_stage !== "ready" ? 1 : 0)

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

  const headDoc = headId ? all.find((d) => d.id === headId) : null
  const nextDoc = waiting[0] ?? null

  const current = headDoc
    ? toView(headDoc, { is_current: true, is_next: false })
    : null
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

export async function runSerialDocumentIngestWorker(userId: string) {
  const all = await fetchAllStudyDocs(userId)

  if (await userHasRunningDocumentJob(userId)) {
    return {
      processed: 0,
      skipped: "already_running" as const,
      results: [],
      queue: await readIngestQueueDetails(userId),
    }
  }

  const { headId } = await healIngestPipeline(userId, all)

  if (!headId) {
    return {
      processed: 0,
      skipped: "idle" as const,
      results: [],
      queue: await readIngestQueueDetails(userId),
    }
  }

  const headDoc = all.find((d) => d.id === headId)
  if (headDoc?.ingest_stage === "uploaded") {
    await ensureHeadIngestJob(userId, headId, "uploaded")
  }

  const jobs = await claimHeadIngestJob(userId, headId)
  if (!jobs.length) {
    return {
      processed: 0,
      skipped: "no_job" as const,
      results: [],
      queue: await readIngestQueueDetails(userId),
    }
  }

  const job = jobs[0]!
  try {
    await processJob(job)
    return {
      processed: 1,
      skipped: null,
      results: [{ id: job.id, status: "done" }],
      queue: await readIngestQueueDetails(userId),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na indexação"
    const pt = (headDoc?.parsed_tables ?? {}) as { ingest_retries?: number }
    const retries = Number(pt.ingest_retries ?? 0)

    if (retries < MAX_AUTO_RETRIES) {
      await supabaseServer
        .from("subject_documents")
        .update({
          ingest_stage: "uploaded",
          status: "pending",
          ingest_error: `Tentativa ${retries + 1} falhou — repetindo…`,
          parsed_tables: { ...pt, ingest_retries: retries + 1 },
        })
        .eq("id", headId)
      await enqueueMaterialIngest(userId, headId, { force: true })
    } else {
      await failDocumentIngest(headId, msg)
    }

    return {
      processed: 0,
      skipped: "failed" as const,
      results: [{ id: job.id, status: "failed", error: msg }],
      queue: await readIngestQueueDetails(userId),
    }
  }
}

export { SERIAL_INGEST_TYPES }
