import { enqueueJob } from "./queue"

export const DOCUMENT_PIPELINE_JOB_TYPES = [
  "document_parse",
  "document_chunk",
  "document_embed",
  "document_ingest",
  "document_batch_ingest",
] as const

/** Pipeline completa num único job (parse + chunk + embed) — fila serial. */
export async function enqueueMaterialIngest(
  userId: string,
  documentId: string,
  options?: { force?: boolean }
) {
  const idempotencyKey = options?.force
    ? `ingest:${documentId}:v2:${Date.now()}`
    : `ingest:${documentId}:v2`
  return enqueueJob({
    userId,
    jobType: "document_ingest",
    idempotencyKey,
    payload: { document_id: documentId },
    priority: options?.force ? 7 : 6,
  })
}

/** @deprecated Use enqueueMaterialIngest — mantido para compat. */
export async function enqueueMaterialParse(
  userId: string,
  documentId: string,
  options?: { force?: boolean }
) {
  return enqueueMaterialIngest(userId, documentId, options)
}

export async function enqueueMaterialParses(
  userId: string,
  documentIds: string[]
) {
  if (!documentIds.length) return
  await enqueueMaterialIngest(userId, documentIds[0]!, { force: false })
}
