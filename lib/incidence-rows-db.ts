import { supabaseServer } from "./supabase-server"
import {
  flatRowsFromBlocks,
  type IncidenceFlatRow,
  type ParsedIncidenceWorkbook,
} from "./incidence-xlsx"

const BATCH = 500

export async function persistIncidenceRows(params: {
  userId: string
  examTargetId: string
  documentId: string
  parsed: ParsedIncidenceWorkbook
}) {
  await supabaseServer
    .from("incidence_rows")
    .delete()
    .eq("user_id", params.userId)
    .eq("exam_target_id", params.examTargetId)

  const rows =
    params.parsed.flat_rows.length > 0
      ? params.parsed.flat_rows
      : flatRowsFromBlocks(params.parsed.blocks, params.parsed.sheet_names[0] ?? "Planilha")

  if (!rows.length) {
    return {
      inserted: 0,
      error:
        "Nenhum tópico encontrado para gravar. No MD, confira se há tabelas em «Tópicos Mais Incidentes por Matéria» (#### slug - Nome).",
    }
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((r) => ({
      user_id: params.userId,
      exam_target_id: params.examTargetId,
      document_id: params.documentId,
      sheet_name: r.sheet_name,
      subject_label: r.subject_label,
      hierarchy_code: r.hierarchy_code,
      topic_name: r.topic_name,
      is_subtopic: r.is_subtopic,
      parent_code: r.parent_code,
      quantity: r.quantity,
      percent: r.percent,
    }))
    const { error } = await supabaseServer.from("incidence_rows").insert(chunk)
    if (error) {
      const hint = error.message.includes("incidence_rows")
        ? ' Execute sql-incidence-rows.sql no Supabase (tabela incidence_rows).'
        : ""
      return { inserted: 0, error: error.message + hint }
    }
  }

  return { inserted: rows.length, error: null as string | null }
}

export async function fetchIncidenceRows(params: {
  userId: string
  examTargetId: string
  subjectId?: string | null
  subjectLabels?: string[]
  limit?: number
}) {
  let query = supabaseServer
    .from("incidence_rows")
    .select("*")
    .eq("user_id", params.userId)
    .eq("exam_target_id", params.examTargetId)
    .order("percent", { ascending: false })

  if (params.subjectLabels?.length) {
    query = query.in("subject_label", params.subjectLabels)
  }

  if (params.subjectId) {
    const labels = await resolveSubjectLabels(
      params.userId,
      params.examTargetId,
      params.subjectId
    )
    if (!labels.length) return []
    query = query.in("subject_label", labels)
  }

  if (params.limit) query = query.limit(params.limit)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return data ?? []
}

export async function resolveSubjectLabels(
  userId: string,
  examTargetId: string,
  subjectId: string
): Promise<string[]> {
  const { data: mdDoc } = await supabaseServer
    .from("subject_documents")
    .select("parsed_tables")
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)
    .eq("doc_type", "strategic_md")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (mdDoc) {
    const pt = (mdDoc.parsed_tables ?? {}) as {
      bundle?: { edital_subjects: { slug: string; name: string }[] }
      subject_mappings?: {
        by_slug?: {
          slug: string
          subject_id: string | null
          subject_ids?: string[]
          md_name: string
        }[]
      }
    }
    const labels: string[] = []
    for (const row of pt.subject_mappings?.by_slug ?? []) {
      const ids =
        row.subject_ids ??
        (row.subject_id ? [row.subject_id] : [])
      if (!ids.includes(subjectId)) continue
      const name =
        pt.bundle?.edital_subjects.find((s) => s.slug === row.slug)?.name ??
        row.md_name
      if (!labels.includes(name)) labels.push(name)
    }
    if (labels.length) return labels
  }

  const wb = await supabaseServer
    .from("subject_documents")
    .select("parsed_tables")
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)
    .eq("doc_type", "incidence")
    .is("subject_id", null)
    .maybeSingle()

  const pt = (wb.data?.parsed_tables ?? {}) as {
    manual_overrides?: Record<string, string | null>
    subject_mappings?: {
      by_subject?: { subject_id: string; excel_label: string }[]
    }
  }

  const labels: string[] = []
  for (const [excelLabel, sid] of Object.entries(pt.manual_overrides ?? {})) {
    if (sid === subjectId) labels.push(excelLabel)
  }
  for (const row of pt.subject_mappings?.by_subject ?? []) {
    if (row.subject_id === subjectId && !labels.includes(row.excel_label)) {
      labels.push(row.excel_label)
    }
  }
  return labels
}

export type IncidenceRowRecord = {
  id: string
  subject_label: string
  hierarchy_code: string
  topic_name: string
  is_subtopic: boolean
  parent_code: string | null
  quantity: number
  percent: number
}
