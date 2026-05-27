import type { NotebookReportStructured } from "../coach-types"
import { supabaseServer } from "../supabase-server"
import { loadMappings } from "../tec-mapping"

type QuestionRow = {
  id: string
  tec_subject: string | null
}

/**
 * Maps question IDs to app subject_id via tec_subject mappings.
 */
export async function resolveQuestionIdsBySubject(
  userId: string,
  questionIds: string[]
): Promise<Map<string, string[]>> {
  const bySubject = new Map<string, string[]>()
  if (!questionIds.length) return bySubject

  const { data: questions, error } = await supabaseServer
    .from("questions")
    .select("id, tec_subject")
    .in("id", questionIds)

  if (error) throw new Error(error.message)

  const mappings = await loadMappings(userId)
  const subjectByTec = new Map<string, string>()
  for (const m of mappings) {
    const tec = (m.tec_subject ?? "").trim()
    if (tec && m.subject_id) subjectByTec.set(tec, m.subject_id)
  }

  for (const q of (questions ?? []) as QuestionRow[]) {
    const tec = (q.tec_subject ?? "").trim()
    const subjectId = subjectByTec.get(tec)
    if (!subjectId) continue
    const list = bySubject.get(subjectId) ?? []
    list.push(q.id)
    bySubject.set(subjectId, list)
  }

  return bySubject
}

export async function resolveNotebookQuestionIdsBySubject(
  userId: string,
  notebookId: string
): Promise<Map<string, string[]>> {
  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select("question_id")
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)

  const questionIds = [
    ...new Set((attempts ?? []).map((a) => a.question_id as string)),
  ]

  if (!questionIds.length) {
    const { data: nq } = await supabaseServer
      .from("notebook_questions")
      .select("question_id")
      .eq("notebook_id", notebookId)

    for (const row of nq ?? []) {
      if (row.question_id) questionIds.push(row.question_id as string)
    }
  }

  return resolveQuestionIdsBySubject(userId, questionIds)
}

export function filterReportStructuredForSubject(
  structured: NotebookReportStructured,
  questionIdsForSubject: Set<string>
): NotebookReportStructured {
  const perQuestion = (structured.per_question_errors ?? []).filter((e) =>
    questionIdsForSubject.has(e.question_id)
  )

  const topicsInSubject = new Set(
    perQuestion.map((e) => (e.tec_topic ?? "").trim()).filter(Boolean)
  )

  const matchTopic = (topic: string) => {
    const t = topic.trim()
    return topicsInSubject.has(t) || [...topicsInSubject].some((x) => x.includes(t) || t.includes(x))
  }

  return {
    ...structured,
    per_question_errors: perQuestion,
    strengths: (structured.strengths ?? []).filter((s) => matchTopic(s.topic)),
    weaknesses: (structured.weaknesses ?? []).filter((w) => matchTopic(w.topic)),
    time_insights: (structured.time_insights ?? []).filter((t) =>
      matchTopic(t.topic)
    ),
    consolidated_topics: (structured.consolidated_topics ?? []).filter((t) =>
      matchTopic(t)
    ),
    recurring_failures: (structured.recurring_failures ?? []).filter((r) =>
      perQuestion.some((e) => e.tec_id === r.tec_id)
    ),
    actions_next_7_days: structured.actions_next_7_days,
    executable_actions: (structured.executable_actions ?? []).filter((a) => {
      const topic = String(a.params?.topic ?? a.params?.tec_topic ?? "").trim()
      if (!topic) return true
      return matchTopic(topic)
    }),
    behavioral_audit: structured.behavioral_audit,
    headline: structured.headline,
    metacognition_patterns: structured.metacognition_patterns,
    confidence_in_analysis: structured.confidence_in_analysis,
    is_multi_subject: structured.is_multi_subject,
    subjects_present: structured.subjects_present,
  }
}

export async function buildSubjectsPresentMeta(
  userId: string,
  bySubject: Map<string, string[]>
): Promise<NotebookReportStructured["subjects_present"]> {
  const subjectIds = [...bySubject.keys()]
  if (!subjectIds.length) return []

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .in("id", subjectIds)

  const nameById = new Map(
    (subjects ?? []).map((s) => [s.id as string, String(s.name ?? s.id)])
  )

  return subjectIds.map((subject_id) => ({
    subject_id,
    name: nameById.get(subject_id) ?? subject_id,
    question_count: bySubject.get(subject_id)?.length ?? 0,
  }))
}
