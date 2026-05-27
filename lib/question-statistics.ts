import { supabaseServer } from "./supabase-server"
import { isSubjectLevelMapping, loadMappings } from "./tec-mapping"

function normKey(s: string) {
  return (s ?? "").trim()
}

export type StatsPeriod = "all" | "7d" | "30d" | "90d"

export type TopicStatRow = {
  name: string
  correct: number
  wrong: number
  total: number
  correct_pct: number
}

export type SubjectStatRow = {
  id: string
  name: string
  short_label: string
  correct: number
  wrong: number
  total: number
  correct_pct: number
  topics: TopicStatRow[]
}

export type QuestionStatisticsResult = {
  summary: {
    total_attempts: number
    correct: number
    wrong: number
    correct_pct: number
    subject_count: number
  }
  by_subject: SubjectStatRow[]
  unassigned: {
    label: string
    correct: number
    wrong: number
    total: number
    correct_pct: number
    topics: TopicStatRow[]
  } | null
}

type QuestionMeta = {
  tec_subject: string | null
  tec_topic: string | null
}

type AttemptRow = {
  question_id: string
  notebook_id: string | null
  is_correct: boolean
  created_at: string
  questions: QuestionMeta | QuestionMeta[] | null
}

function unwrapQ(
  q: QuestionMeta | QuestionMeta[] | null | undefined
): QuestionMeta | null {
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : q
}

function periodStart(period: StatsPeriod): string | null {
  if (period === "all") return null
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export function subjectShortLabel(name: string): string {
  const paren = name.match(/\(([^)]+)\)/)
  if (paren?.[1] && paren[1].length <= 10) return paren[1].trim()
  const cleaned = name.replace(/\([^)]*\)/g, "").trim()
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2)
  if (words.length >= 2) {
    return words
      .slice(0, 5)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
  }
  return cleaned.slice(0, 5).toUpperCase()
}

function bump(
  map: Map<string, { correct: number; wrong: number }>,
  key: string,
  isCorrect: boolean
) {
  const g = map.get(key) ?? { correct: 0, wrong: 0 }
  if (isCorrect) g.correct++
  else g.wrong++
  map.set(key, g)
}

function mapToTopicRows(map: Map<string, { correct: number; wrong: number }>): TopicStatRow[] {
  return [...map.entries()]
    .map(([name, g]) => {
      const total = g.correct + g.wrong
      return {
        name,
        correct: g.correct,
        wrong: g.wrong,
        total,
        correct_pct: total > 0 ? Math.round((g.correct / total) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

function buildSubjectRow(
  id: string,
  name: string,
  topicMap: Map<string, { correct: number; wrong: number }>
): SubjectStatRow {
  const topics = mapToTopicRows(topicMap)
  const correct = topics.reduce((s, t) => s + t.correct, 0)
  const wrong = topics.reduce((s, t) => s + t.wrong, 0)
  const total = correct + wrong
  return {
    id,
    name,
    short_label: subjectShortLabel(name),
    correct,
    wrong,
    total,
    correct_pct: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
    topics,
  }
}

export async function fetchQuestionStatistics(
  userId: string,
  opts: { period?: StatsPeriod; subjectIds?: string[] } = {}
): Promise<QuestionStatisticsResult> {
  const period = opts.period ?? "all"
  const filterSubjectIds =
    opts.subjectIds?.length && !opts.subjectIds.includes("__all__")
      ? new Set(opts.subjectIds)
      : null

  const since = periodStart(period)

  const [{ data: subjects }, mappings] = await Promise.all([
    supabaseServer.from("subjects").select("id, name").eq("user_id", userId).order("name"),
    loadMappings(userId),
  ])

  const subjectById = new Map((subjects ?? []).map((s) => [s.id, s.name]))
  const tecSubjectToSubjectId = new Map<string, string>()
  for (const m of mappings) {
    if (!isSubjectLevelMapping(m.tec_topic)) continue
    tecSubjectToSubjectId.set(normKey(m.tec_subject), m.subject_id)
  }

  const { data: notebooks } = await supabaseServer
    .from("notebooks")
    .select("id, subject_id")
    .eq("user_id", userId)

  const notebookSubject = new Map(
    (notebooks ?? []).map((n) => [n.id, n.subject_id as string | null])
  )

  let attemptQuery = supabaseServer
    .from("question_attempts")
    .select(
      `
      question_id, notebook_id, is_correct, created_at,
      questions ( tec_subject, tec_topic )
    `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (since) {
    attemptQuery = attemptQuery.gte("created_at", since)
  }

  const { data: attemptsRaw, error } = await attemptQuery
  if (error) throw new Error(error.message)

  const attempts = (attemptsRaw ?? []) as AttemptRow[]

  const bySubjectTopics = new Map<string, Map<string, { correct: number; wrong: number }>>()
  const unassignedTopics = new Map<string, { correct: number; wrong: number }>()

  for (const s of subjects ?? []) {
    bySubjectTopics.set(s.id, new Map())
  }

  for (const a of attempts) {
    const q = unwrapQ(a.questions)
    const topic = q?.tec_topic?.trim() || "Sem assunto"

    let subjectId: string | null = null
    if (a.notebook_id) {
      subjectId = notebookSubject.get(a.notebook_id) ?? null
    }
    if (!subjectId && q?.tec_subject) {
      subjectId = tecSubjectToSubjectId.get(normKey(q.tec_subject)) ?? null
    }

    if (subjectId && !subjectById.has(subjectId)) {
      subjectId = null
    }

    if (filterSubjectIds && subjectId && !filterSubjectIds.has(subjectId)) {
      continue
    }
    if (filterSubjectIds && !subjectId) {
      continue
    }

    if (subjectId) {
      const topicMap = bySubjectTopics.get(subjectId)!
      bump(topicMap, topic, a.is_correct)
    } else {
      bump(unassignedTopics, topic, a.is_correct)
    }
  }

  const by_subject: SubjectStatRow[] = (subjects ?? [])
    .map((s) => buildSubjectRow(s.id, s.name, bySubjectTopics.get(s.id)!))
    .filter((row) => {
      if (!filterSubjectIds) return row.total > 0
      return filterSubjectIds.has(row.id)
    })

  const unassignedTotal = [...unassignedTopics.values()].reduce(
    (s, g) => s + g.correct + g.wrong,
    0
  )

  const unassigned =
    unassignedTotal > 0 && !filterSubjectIds
      ? (() => {
          const topics = mapToTopicRows(unassignedTopics)
          const correct = topics.reduce((s, t) => s + t.correct, 0)
          const wrong = topics.reduce((s, t) => s + t.wrong, 0)
          const total = correct + wrong
          return {
            label: "Sem matéria vinculada",
            correct,
            wrong,
            total,
            correct_pct: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
            topics,
          }
        })()
      : null

  const allRows = [...by_subject]
  if (unassigned) {
    allRows.push({
      id: "__unassigned__",
      name: unassigned.label,
      short_label: "OUT",
      correct: unassigned.correct,
      wrong: unassigned.wrong,
      total: unassigned.total,
      correct_pct: unassigned.correct_pct,
      topics: unassigned.topics,
    })
  }

  const correct = allRows.reduce((s, r) => s + r.correct, 0)
  const wrong = allRows.reduce((s, r) => s + r.wrong, 0)
  const total_attempts = correct + wrong

  return {
    summary: {
      total_attempts,
      correct,
      wrong,
      correct_pct:
        total_attempts > 0
          ? Math.round((correct / total_attempts) * 1000) / 10
          : 0,
      subject_count: by_subject.filter((r) => r.total > 0).length,
    },
    by_subject,
    unassigned: filterSubjectIds ? null : unassigned,
  }
}
