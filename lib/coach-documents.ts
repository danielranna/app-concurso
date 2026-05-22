import { supabaseServer } from "./supabase-server"
import { extractPdfText } from "./pdf-extract"
import {
  incidenceSummaryForLlm,
  parseIncidenceXlsx,
  type ParsedIncidenceWorkbook,
} from "./incidence-xlsx"

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[… texto truncado …]`
}

export const COACH_DOCS_BUCKET = "coach-documents"

export type CoachDocType = "edital" | "incidence" | "study_material"

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
}

function pickBlockForSubject(
  parsed: ParsedIncidenceWorkbook,
  subjectName: string
) {
  const n = norm(subjectName)
  const exact = parsed.blocks.find((b) => norm(b.subject_label) === n)
  if (exact) return exact
  const partial = parsed.blocks.find(
    (b) => norm(b.subject_label).includes(n) || n.includes(norm(b.subject_label))
  )
  return partial ?? parsed.blocks[0] ?? null
}

export async function uploadCoachDocument(params: {
  userId: string
  file: File
  docType: CoachDocType
  title: string
  subjectId?: string | null
  subjectName?: string | null
  examTargetId?: string | null
}) {
  if (params.file.size > 20 * 1024 * 1024) {
    throw new Error("Arquivo maior que 20 MB")
  }

  const buffer = Buffer.from(await params.file.arrayBuffer())
  const ext = (params.file.name.split(".").pop() || "").toLowerCase()

  let parsed_tables: Record<string, unknown> = {}
  let contentType = params.file.type

  if (params.docType === "incidence") {
    if (!["xlsx", "xls"].includes(ext)) {
      throw new Error("Incidência deve ser arquivo Excel (.xlsx ou .xls)")
    }
    const parsed = parseIncidenceXlsx(buffer)
    const block =
      params.subjectName != null
        ? pickBlockForSubject(parsed, params.subjectName)
        : parsed.blocks[0]

    parsed_tables = {
      format: "xlsx_incidence",
      sheet_names: parsed.sheet_names,
      blocks: parsed.blocks,
      matched_subject_label: block?.subject_label ?? null,
      groups: block?.groups ?? [],
      group_count: block?.groups.length ?? 0,
      summary_for_llm: incidenceSummaryForLlm(parsed),
      text_excerpt: JSON.stringify(incidenceSummaryForLlm(parsed), null, 0).slice(
        0,
        50_000
      ),
    }
    contentType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  } else {
    if (ext !== "pdf") {
      throw new Error("Este tipo de documento deve ser PDF")
    }
    const text = await extractPdfText(buffer)
    const excerpt = truncateText(text, 120_000)
    parsed_tables = { format: "pdf", text_excerpt: excerpt, char_count: text.length }
    contentType = "application/pdf"
  }

  const path = `${params.userId}/${params.docType}/${Date.now()}.${ext}`

  const { error: upErr } = await supabaseServer.storage
    .from(COACH_DOCS_BUCKET)
    .upload(path, buffer, {
      contentType: contentType || "application/octet-stream",
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

  const { data: doc, error: insErr } = await supabaseServer
    .from("subject_documents")
    .insert({
      user_id: params.userId,
      subject_id: params.subjectId ?? null,
      exam_target_id: params.examTargetId ?? null,
      doc_type: params.docType,
      file_path: path,
      title: params.title.trim() || params.file.name,
      parsed_tables,
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
  parsed_tables?: Record<string, unknown> | null
}) {
  const pt = (doc.parsed_tables ?? {}) as Record<string, unknown>
  if (pt.format === "xlsx_incidence") {
    return String(pt.text_excerpt ?? JSON.stringify(pt.summary_for_llm ?? []))
  }
  return String(pt.text_excerpt ?? "")
}

export function documentIncidenceGroups(doc: {
  parsed_tables?: Record<string, unknown> | null
}) {
  const pt = (doc.parsed_tables ?? {}) as {
    groups?: { name: string; percent: number; quantity: number; code: string }[]
  }
  return pt.groups ?? []
}
