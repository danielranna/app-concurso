import { supabaseServer } from "./supabase-server"
import { resolveSubjectLabelsForExam } from "./strategic-weights"
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
        "Nenhum tópico encontrado para gravar. Confira se o Excel tem colunas Hierarquia, Índice, Quantidade e Porcentagem.",
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
  return resolveSubjectLabelsForExam(userId, examTargetId, subjectId)
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
