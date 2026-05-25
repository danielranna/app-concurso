import { supabaseServer } from "../supabase-server"
import { buildIncidencePayloadForExam } from "../coach-documents"
import { fetchIncidenceRows } from "../incidence-rows-db"
import { recomputeAllSubjectsQueue } from "./strategic-queue"

export type StrategyTopicRow = {
  topic_key: string
  incidence_percent: number | null
  incidence_quantity: number | null
  priority_score: number | null
  gap_score: number | null
  retention_penalty: number | null
  reason: string | null
  in_queue: boolean
  is_subtopic: boolean
  hierarchy_code: string | null
}

export type StrategySubjectRow = {
  subject_id: string
  subject_name: string
  excel_label: string | null
  excel_labels: string[]
  subject_rank: number
  avg_priority_score: number
  topics: StrategyTopicRow[]
}

export type ExamStrategyBoard = {
  exam_target_id: string
  exam_name: string
  subjects: StrategySubjectRow[]
  merge_warnings: { subject_name: string; excel_labels: string[] }[]
  parse_stats: Record<string, unknown> | null
  generated_at: string
}

export async function buildExamStrategyBoard(
  userId: string,
  examTargetId: string,
  options?: { refreshQueue?: boolean }
): Promise<ExamStrategyBoard> {
  const { data: exam } = await supabaseServer
    .from("exam_targets")
    .select("id, name")
    .eq("id", examTargetId)
    .eq("user_id", userId)
    .single()

  if (!exam) throw new Error("Prova alvo não encontrada")

  if (options?.refreshQueue) {
    await recomputeAllSubjectsQueue(userId)
  }

  const incidencePayload = await buildIncidencePayloadForExam(userId, examTargetId)
  const parse_stats =
    (incidencePayload.workbook?.parsed_tables as { parse_stats?: Record<string, unknown> })
      ?.parse_stats ?? null
  const merge_warnings = incidencePayload.merge_warnings ?? []

  const { data: queue } = await supabaseServer
    .from("strategic_queue_items")
    .select("*")
    .eq("user_id", userId)
    .order("priority_score", { ascending: false })

  const queueBySubject = new Map<string, typeof queue>()
  for (const item of queue ?? []) {
    const list = queueBySubject.get(item.subject_id) ?? []
    list.push(item)
    queueBySubject.set(item.subject_id, list)
  }

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)

  const rows: StrategySubjectRow[] = []

  for (const sub of subjects ?? []) {
    const mapping = incidencePayload.for_llm.find((r) => r.subject_id === sub.id)
    const excelLabels = mapping?.excel_labels ?? (mapping?.excel_label ? [mapping.excel_label] : [])

    const incidenceRows = excelLabels.length
      ? await fetchIncidenceRows({
          userId,
          examTargetId,
          subjectLabels: excelLabels,
        })
      : await fetchIncidenceRows({
          userId,
          examTargetId,
          subjectId: sub.id,
        })

    const qItems = queueBySubject.get(sub.id) ?? []
    const queueByTopic = new Map(qItems.map((q) => [q.topic_key, q]))

    const topicMap = new Map<string, StrategyTopicRow>()

    for (const r of incidenceRows) {
      const key = r.topic_name.trim()
      if (!key) continue
      const qi = queueByTopic.get(key)
      topicMap.set(key, {
        topic_key: key,
        incidence_percent: Number(r.percent),
        incidence_quantity: r.quantity,
        priority_score: qi?.priority_score ?? null,
        gap_score: qi?.gap_score ?? null,
        retention_penalty: qi?.retention_penalty ?? null,
        reason: qi?.reason ?? null,
        in_queue: !!qi,
        is_subtopic: r.is_subtopic,
        hierarchy_code: r.hierarchy_code,
      })
    }

    for (const [topic_key, qi] of queueByTopic) {
      if (!topicMap.has(topic_key)) {
        topicMap.set(topic_key, {
          topic_key,
          incidence_percent: null,
          incidence_quantity: null,
          priority_score: qi.priority_score,
          gap_score: qi.gap_score,
          retention_penalty: qi.retention_penalty,
          reason: qi.reason,
          in_queue: true,
          is_subtopic: false,
          hierarchy_code: null,
        })
      }
    }

    const topics = [...topicMap.values()].sort((a, b) => {
      const pa = a.priority_score ?? 0
      const pb = b.priority_score ?? 0
      if (pb !== pa) return pb - pa
      return (b.incidence_percent ?? 0) - (a.incidence_percent ?? 0)
    })

    if (!topics.length && !excelLabels.length) continue

    const avg =
      qItems.length > 0
        ? qItems.reduce((s, q) => s + Number(q.priority_score), 0) / qItems.length
        : 0

    rows.push({
      subject_id: sub.id,
      subject_name: sub.name,
      excel_label: mapping?.excel_label ?? (excelLabels.join(" + ") || null),
      excel_labels: excelLabels,
      subject_rank: 0,
      avg_priority_score: Math.round(avg * 1000) / 1000,
      topics,
    })
  }

  rows.sort((a, b) => b.avg_priority_score - a.avg_priority_score)
  rows.forEach((r, i) => {
    r.subject_rank = i + 1
  })

  return {
    exam_target_id: examTargetId,
    exam_name: exam.name,
    subjects: rows,
    merge_warnings: merge_warnings.map((w) => ({
      subject_name: w.subject_name,
      excel_labels: w.excel_labels,
    })),
    parse_stats,
    generated_at: new Date().toISOString(),
  }
}
