import { supabaseServer } from "../supabase-server"
import { buildIncidencePayloadForExam } from "../coach-documents"
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
}

export type StrategySubjectRow = {
  subject_id: string
  subject_name: string
  excel_label: string | null
  subject_rank: number
  avg_priority_score: number
  topics: StrategyTopicRow[]
}

export type ExamStrategyBoard = {
  exam_target_id: string
  exam_name: string
  subjects: StrategySubjectRow[]
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

  const incidence = await buildIncidencePayloadForExam(userId, examTargetId)

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

  const subjectNameById = new Map(
    (subjects ?? []).map((s) => [s.id, s.name])
  )

  const incidenceBySubjectId = new Map(
    incidence.for_llm.map((row) => [row.subject_id, row])
  )

  const subjectIds = new Set<string>()
  for (const s of subjects ?? []) subjectIds.add(s.id)
  for (const row of incidence.for_llm) {
    if (row.subject_id) subjectIds.add(row.subject_id)
  }

  const rows: StrategySubjectRow[] = []

  for (const subjectId of subjectIds) {
    const inc = incidenceBySubjectId.get(subjectId)
    const subjectName =
      inc?.subject_name ?? subjectNameById.get(subjectId) ?? "Matéria"
    const qItems = queueBySubject.get(subjectId) ?? []
    const queueByTopic = new Map(qItems.map((q) => [q.topic_key, q]))

    const topicKeys = new Set<string>()
    for (const g of inc?.top_topics ?? []) {
      const name = (g as { name?: string }).name?.trim()
      if (name) topicKeys.add(name)
    }
    for (const q of qItems) topicKeys.add(q.topic_key)

    const topics: StrategyTopicRow[] = [...topicKeys].map((topic_key) => {
      const g = (inc?.top_topics ?? []).find(
        (t) => (t as { name?: string }).name?.trim() === topic_key
      ) as { name?: string; percent?: number; qty?: number } | undefined
      const qi = queueByTopic.get(topic_key)
      return {
        topic_key,
        incidence_percent: g?.percent ?? null,
        incidence_quantity: g?.qty ?? null,
        priority_score: qi?.priority_score ?? null,
        gap_score: qi?.gap_score ?? null,
        retention_penalty: qi?.retention_penalty ?? null,
        reason: qi?.reason ?? null,
        in_queue: !!qi,
      }
    })

    topics.sort((a, b) => {
      const pa = a.priority_score ?? 0
      const pb = b.priority_score ?? 0
      if (pb !== pa) return pb - pa
      return (b.incidence_percent ?? 0) - (a.incidence_percent ?? 0)
    })

    const avg =
      qItems.length > 0
        ? qItems.reduce((s, q) => s + Number(q.priority_score), 0) / qItems.length
        : 0

    rows.push({
      subject_id: subjectId,
      subject_name: subjectName,
      excel_label: inc?.excel_label ?? null,
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
    generated_at: new Date().toISOString(),
  }
}
