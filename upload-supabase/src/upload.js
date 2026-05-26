import { createHash } from "crypto"
import { getServiceClient } from "./supabase.js"

/**
 * Upload de material de estudo (PDF) — espelha study_material em lib/coach-documents.ts
 */
export async function uploadStudyMaterialPdf(config, params) {
  const { userId, buffer, fileName, title, subjectId } = params
  const supabase = getServiceClient(config)

  const ext = (fileName.split(".").pop() || "").toLowerCase()
  if (ext !== "pdf") {
    throw new Error("Material de estudo deve ser PDF")
  }

  const fileHash = createHash("sha256").update(buffer).digest("hex")

  const { data: dup } = await supabase
    .from("subject_documents")
    .select("id, title, ingest_stage, chunk_count, status, doc_type")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("doc_type", "study_material")
    .eq("file_sha256", fileHash)
    .maybeSingle()

  if (dup?.id) {
    return { doc: dup, duplicate: true }
  }

  const path = `${userId}/study_material/${Date.now()}.pdf`
  const parsed_tables = { format: "pdf", pending_parse: true }

  const { error: upErr } = await supabase.storage
    .from(config.bucket)
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: false,
    })

  if (upErr) {
    if (upErr.message.includes("Bucket not found")) {
      throw new Error(
        'Crie o bucket "coach-documents" no Supabase Storage (privado).'
      )
    }
    throw new Error(upErr.message)
  }

  const insertRow = {
    user_id: userId,
    subject_id: subjectId,
    exam_target_id: null,
    doc_type: "study_material",
    file_path: path,
    title: (title || fileName).trim() || fileName,
    parsed_tables,
    status: "pending",
    file_sha256: fileHash,
    ingest_stage: "uploaded",
    chunk_count: 0,
  }

  const { data: inserted, error: insErr } = await supabase
    .from("subject_documents")
    .insert(insertRow)
    .select("*")
    .single()

  if (insErr) {
    const { file_sha256: _h, ingest_stage: _s, chunk_count: _c, ...fallback } =
      insertRow
    const retry = await supabase
      .from("subject_documents")
      .insert(fallback)
      .select("*")
      .single()
    if (retry.error) throw new Error(retry.error.message)
    return { doc: retry.data, duplicate: false }
  }

  if (!inserted) throw new Error("Falha ao salvar documento")
  return { doc: inserted, duplicate: false }
}
