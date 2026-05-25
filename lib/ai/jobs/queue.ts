import { supabaseServer } from "../../supabase-server"

export type JobType =
  | "notebook_report_aggregate"
  | "classify_wrong_attempts"
  | "explain_wrong_attempt"
  | "brain_ingest_report"
  | "strategy_recompute"
  | "strategy_recompute_all"
  | "execution_plan_today"
  | "document_ingest"
  | "document_parse"
  | "document_chunk"
  | "document_embed"
  | "document_batch_ingest"

export async function enqueueJob(params: {
  userId: string
  jobType: JobType
  idempotencyKey: string
  payload?: Record<string, unknown>
  priority?: number
  scheduledAt?: Date
}) {
  const { data, error } = await supabaseServer
    .from("ai_jobs")
    .upsert(
      {
        user_id: params.userId,
        job_type: params.jobType,
        idempotency_key: params.idempotencyKey,
        payload: params.payload ?? {},
        status: "pending",
        priority: params.priority ?? 0,
        scheduled_at: (params.scheduledAt ?? new Date()).toISOString(),
      },
      { onConflict: "user_id,idempotency_key", ignoreDuplicates: true }
    )
    .select("id, status")
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function enqueueNotebookPipeline(
  userId: string,
  notebookId: string,
  subjectId: string | null,
  options?: { force?: boolean }
) {
  await enqueueJob({
    userId,
    jobType: "notebook_report_aggregate",
    idempotencyKey: `notebook_report:${notebookId}`,
    payload: { notebook_id: notebookId, subject_id: subjectId, force: options?.force },
    priority: 10,
  })
}

export async function claimPendingJobs(limit = 5) {
  const { data: pending } = await supabaseServer
    .from("ai_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("priority", { ascending: false })
    .order("scheduled_at", { ascending: true })
    .limit(limit)

  const claimed = []
  for (const job of pending ?? []) {
    const { data } = await supabaseServer
      .from("ai_jobs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle()

    if (data) claimed.push(data)
  }
  return claimed
}

export async function completeJob(
  jobId: string,
  result: Record<string, unknown> | null,
  error?: string
) {
  await supabaseServer
    .from("ai_jobs")
    .update({
      status: error ? "failed" : "done",
      result: result ?? {},
      error_message: error ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
}
