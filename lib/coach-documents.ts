import { supabaseServer } from "./supabase-server"
import { extractPdfText } from "./pdf-extract"
import {
  incidenceSummaryForLlm,
  parseIncidenceXlsx,
  type IncidenceSubjectBlock,
} from "./incidence-xlsx"
import {
  groupsForSubjectFromBlocks,
  mapIncidenceBlocksToSubjects,
  pickBlockForSubject,
  type SubjectRow,
} from "./incidence-subject-map"

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[… texto truncado …]`
}

export const COACH_DOCS_BUCKET = "coach-documents"

export type CoachDocType = "edital" | "incidence" | "study_material"

export type IncidenceWorkbookDoc = {
  id: string
  title: string
  parsed_tables: {
    scope?: string
    blocks?: IncidenceSubjectBlock[]
    subject_mappings?: ReturnType<typeof mapIncidenceBlocksToSubjects>
    block_count?: number
    sheet_names?: string[]
  }
}

/** Único Excel de incidência da prova (todas as matérias no arquivo). */
export async function getExamIncidenceWorkbook(
  userId: string,
  examTargetId: string
): Promise<IncidenceWorkbookDoc | null> {
  const docs = await listCoachDocuments(userId, {
    examTargetId,
    docType: "incidence",
  })
  const wb = docs.find(
    (d) =>
      !d.subject_id &&
      (d.parsed_tables as { scope?: string } | null)?.scope === "exam_workbook"
  )
  if (!wb) return null
  return wb as IncidenceWorkbookDoc
}

export async function buildIncidencePayloadForExam(
  userId: string,
  examTargetId: string
) {
  const wb = await getExamIncidenceWorkbook(userId, examTargetId)
  const blocks =
    (wb?.parsed_tables as { blocks?: IncidenceSubjectBlock[] } | null)?.blocks ??
    []

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)

  const mapping = mapIncidenceBlocksToSubjects(
    blocks,
    (subjects ?? []) as SubjectRow[]
  )

  return {
    workbook: wb,
    blocks,
    mapping,
    for_llm: mapping.by_subject.map((row) => ({
      subject_id: row.subject_id,
      subject_name: row.subject_name,
      excel_label: row.excel_label,
      top_topics: [...row.groups]
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 8)
        .map((g) => ({ name: g.name, percent: g.percent, qty: g.quantity })),
    })),
  }
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
    if (!params.examTargetId) {
      throw new Error("exam_target_id obrigatório para incidência")
    }

    const parsed = parseIncidenceXlsx(buffer)

    const { data: subjects } = await supabaseServer
      .from("subjects")
      .select("id, name")
      .eq("user_id", params.userId)

    const subjectMappings = mapIncidenceBlocksToSubjects(
      parsed.blocks,
      (subjects ?? []) as SubjectRow[]
    )

    const isWorkbook = !params.subjectId

    if (isWorkbook) {
      await supabaseServer
        .from("subject_documents")
        .delete()
        .eq("user_id", params.userId)
        .eq("exam_target_id", params.examTargetId)
        .eq("doc_type", "incidence")
        .is("subject_id", null)
    }

    const block =
      params.subjectName != null
        ? pickBlockForSubject(parsed.blocks, params.subjectName)
        : null

    parsed_tables = {
      format: "xlsx_incidence",
      scope: isWorkbook ? "exam_workbook" : "single_subject",
      sheet_names: parsed.sheet_names,
      blocks: parsed.blocks,
      block_count: parsed.blocks.length,
      subject_mappings: isWorkbook ? subjectMappings : undefined,
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

/** Grupos de incidência para uma matéria (workbook único ou upload antigo por matéria). */
export async function incidenceGroupsForSubject(
  userId: string,
  examTargetId: string,
  subjectId: string,
  subjectName: string
) {
  const wb = await getExamIncidenceWorkbook(userId, examTargetId)
  if (wb?.parsed_tables?.blocks?.length) {
    return groupsForSubjectFromBlocks(wb.parsed_tables.blocks, subjectName)
  }
  const docs = await listCoachDocuments(userId, {
    examTargetId,
    subjectId,
    docType: "incidence",
  })
  const legacy = docs[0]
  return legacy ? documentIncidenceGroups(legacy) : []
}
