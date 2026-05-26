import { supabaseServer } from "../../supabase-server"
import { DOCUMENT_PIPELINE_JOB_TYPES } from "./document-enqueue"
import type { JobType } from "./queue"
import { runJobWorker } from "./worker"

const SERIAL_INGEST_TYPES: JobType[] = [...DOCUMENT_PIPELINE_JOB_TYPES]

/** Já há parse/chunk/embed em execução para este usuário — espera a vez na fila. */
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

/** Quantos PDFs de estudo ainda não estão prontos (todas as matérias). */
export async function countPendingMaterialIngest(userId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from("subject_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .in("ingest_stage", ["uploaded", "parsing", "chunking", "embedding"])

  if (error) throw new Error(error.message)
  return count ?? 0
}

/**
 * Fila global por usuário: no máximo 1 job de indexação por vez.
 * Próximo arquivo só entra quando o anterior termina a etapa atual.
 */
export async function runSerialDocumentIngestWorker(userId: string) {
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
