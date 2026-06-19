import { supabaseServer } from "../../supabase-server"

export type JobType =
  | "notebook_report_aggregate"
  | "classify_wrong_attempts"
  | "brain_ingest_report"
  | "subject_dossier_generate"
  | "error_notebook_ingest"
  | "strategy_recompute"
  | "strategy_recompute_all"
  | "execution_plan_today"

export async function enqueueJob(params: {
  userId: string
  jobType: JobType
  idempotencyKey: string
  payload?: Record<string, unknown>
  priority?: number
  scheduledAt?: Date
}) {
  const nowIso = (params.scheduledAt ?? new Date()).toISOString()

  const { data: existing, error: existingErr } = await supabaseServer
    .from("ai_jobs")
    .select("id, status")
    .eq("user_id", params.userId)
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle()

  if (existingErr) throw new Error(existingErr.message)

  if (existing?.status === "running") {
    return existing
  }

  if (existing) {
    const { data, error } = await supabaseServer
      .from("ai_jobs")
      .update({
        job_type: params.jobType,
        payload: params.payload ?? {},
        status: "pending",
        priority: params.priority ?? 0,
        scheduled_at: nowIso,
        started_at: null,
        completed_at: null,
        error_message: null,
        result: {},
      })
      .eq("id", existing.id)
      .select("id, status")
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data
  }

  const { data, error } = await supabaseServer
    .from("ai_jobs")
    .insert({
      user_id: params.userId,
      job_type: params.jobType,
      idempotency_key: params.idempotencyKey,
      payload: params.payload ?? {},
      status: "pending",
      priority: params.priority ?? 0,
      scheduled_at: nowIso,
    })
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

export async function claimPendingJobs(
  limit = 5,
  options?: { userId?: string; jobTypes?: JobType[] }
) {
  const staleThresholdIso = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  let staleQuery = supabaseServer
    .from("ai_jobs")
    .update({
      status: "pending",
      started_at: null,
      error_message: "auto_requeued_stale_running",
    })
    .eq("status", "running")
    .is("completed_at", null)
    .lt("started_at", staleThresholdIso)

  if (options?.userId) {
    staleQuery = staleQuery.eq("user_id", options.userId)
  }
  if (options?.jobTypes?.length) {
    staleQuery = staleQuery.in("job_type", options.jobTypes)
  }
  await staleQuery

  const runId = `claim-pending:${Date.now()}`
  let query = supabaseServer
    .from("ai_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())

  if (options?.userId) {
    query = query.eq("user_id", options.userId)
  }
  if (options?.jobTypes?.length) {
    query = query.in("job_type", options.jobTypes)
  }

  const { data: pending } = await query
    .order("priority", { ascending: false })
    .order("scheduled_at", { ascending: true })
    .limit(limit)
  // #region agent log
  fetch("http://127.0.0.1:7663/ingest/6e20de48-eef2-41d7-982f-427766678040", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f29fd5" },
    body: JSON.stringify({
      sessionId: "f29fd5",
      runId,
      hypothesisId: "H5",
      location: "jobs/queue.ts:claimPendingJobs:query-result",
      message: "pending jobs query result",
      data: {
        limit,
        hasUserFilter: Boolean(options?.userId),
        userFilter: options?.userId ?? null,
        jobTypes: options?.jobTypes ?? [],
        pendingCount: pending?.length ?? 0,
        pendingJobTypes: (pending ?? []).map((j) => j.job_type).slice(0, 20),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion

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
