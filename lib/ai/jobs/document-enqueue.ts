import { enqueueJob } from "./queue"

/** Jobs da pipeline de material (upload → parse → chunk → embed). */
export const DOCUMENT_PIPELINE_JOB_TYPES = [
  "document_parse",
  "document_chunk",
  "document_embed",
  "document_ingest",
  "document_batch_ingest",
] as const

/** Enfileira só a leitura do PDF; chunk e embed entram em jobs seguintes. */
export async function enqueueMaterialParse(
  userId: string,
  documentId: string,
  options?: { force?: boolean }
) {
  const idempotencyKey = options?.force
    ? `parse:${documentId}:v1:${Date.now()}`
    : `parse:${documentId}:v1`
  return enqueueJob({
    userId,
    jobType: "document_parse",
    idempotencyKey,
    payload: { document_id: documentId },
    priority: options?.force ? 7 : 6,
  })
}

export async function enqueueMaterialParses(
  userId: string,
  documentIds: string[]
) {
  await Promise.all(
    documentIds.map((documentId) => enqueueMaterialParse(userId, documentId))
  )
}
