import { getServiceClient } from "./supabase.js"

export async function enqueueJob(config, params) {
  const supabase = getServiceClient(config)
  const { data, error } = await supabase
    .from("ai_jobs")
    .upsert(
      {
        user_id: params.userId,
        job_type: params.jobType,
        idempotency_key: params.idempotencyKey,
        payload: params.payload ?? {},
        status: "pending",
        priority: params.priority ?? 0,
        scheduled_at: new Date().toISOString(),
      },
      { onConflict: "user_id,idempotency_key", ignoreDuplicates: true }
    )
    .select("id, status")
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function enqueueMaterialParse(config, userId, documentId) {
  return enqueueJob(config, {
    userId,
    jobType: "document_parse",
    idempotencyKey: `parse:${documentId}:v1`,
    payload: { document_id: documentId },
    priority: 6,
  })
}

export async function enqueueMaterialParses(config, userId, documentIds) {
  await Promise.all(
    documentIds.map((documentId) =>
      enqueueMaterialParse(config, userId, documentId)
    )
  )
}
