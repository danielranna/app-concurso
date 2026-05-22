import { supabaseServer } from "./supabase-server"
import { extractPdfText } from "./pdf-extract"

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[… texto truncado …]`
}

export const COACH_DOCS_BUCKET = "coach-documents"

export type CoachDocType = "edital" | "incidence" | "study_material"

export async function uploadCoachDocument(params: {
  userId: string
  file: File
  docType: CoachDocType
  title: string
  subjectId?: string | null
  examTargetId?: string | null
}) {
  if (params.file.size > 20 * 1024 * 1024) {
    throw new Error("PDF maior que 20 MB")
  }

  const buffer = Buffer.from(await params.file.arrayBuffer())
  const text = await extractPdfText(buffer)
  const excerpt = truncateText(text, 120_000)

  const ext = params.file.name.split(".").pop() || "pdf"
  const path = `${params.userId}/${params.docType}/${Date.now()}.${ext}`

  const { error: upErr } = await supabaseServer.storage
    .from(COACH_DOCS_BUCKET)
    .upload(path, buffer, {
      contentType: params.file.type || "application/pdf",
      upsert: false,
    })

  if (upErr) throw new Error(upErr.message)

  const { data: doc, error: insErr } = await supabaseServer
    .from("subject_documents")
    .insert({
      user_id: params.userId,
      subject_id: params.subjectId ?? null,
      exam_target_id: params.examTargetId ?? null,
      doc_type: params.docType,
      file_path: path,
      title: params.title.trim() || params.file.name,
      parsed_tables: { text_excerpt: excerpt, char_count: text.length },
      status: "ready",
    })
    .select("*")
    .single()

  if (insErr) throw new Error(insErr.message)

  if (params.docType === "edital" && params.examTargetId) {
    await supabaseServer
      .from("exam_targets")
      .update({ edital_document_id: doc.id })
      .eq("id", params.examTargetId)
      .eq("user_id", params.userId)
  }

  return doc
}

export async function listCoachDocuments(
  userId: string,
  filters?: { examTargetId?: string; subjectId?: string; docType?: CoachDocType }
) {
  let q = supabaseServer
    .from("subject_documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (filters?.examTargetId) q = q.eq("exam_target_id", filters.examTargetId)
  if (filters?.subjectId) q = q.eq("subject_id", filters.subjectId)
  if (filters?.docType) q = q.eq("doc_type", filters.docType)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export function documentTextExcerpt(doc: {
  parsed_tables?: { text_excerpt?: string } | null
}) {
  const pt = doc.parsed_tables as { text_excerpt?: string } | null
  return pt?.text_excerpt ?? ""
}
