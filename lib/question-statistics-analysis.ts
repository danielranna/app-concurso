import { supabaseServer } from "./supabase-server"
import { isSubjectLevelMapping, loadMappings } from "./tec-mapping"
import {
  ERROR_TAXONOMY_LABELS,
  OUTCOME_CATEGORY_LABELS,
} from "./coach-labels"
import type { StatsPeriod } from "./question-statistics"
import {
  classifySequencePattern,
  type SequencePattern,
} from "./question-sequence-pattern"

function normKey(s: string) {
  return (s ?? "").trim()
}

function stripHtml(html: string): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function periodStart(period: StatsPeriod): string | null {
  if (period === "all") return null
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

type QuestionMeta = {
  statement: string | null
  tec_subject: string | null
  tec_topic: string | null
}

type AttemptRow = {
  question_id: string
  notebook_id: string | null
  is_correct: boolean
  created_at: string
  outcome_category: string | null
  error_taxonomy: string | null
  questions: QuestionMeta | QuestionMeta[] | null
}

function unwrapQ(
  q: QuestionMeta | QuestionMeta[] | null | undefined
): QuestionMeta | null {
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : q
}

export type AnalysisQuestionRow = {
  question_id: string
  statement_preview: string
  tec_subject: string | null
  tec_topic: string
  subject_id: string | null
  subject_name: string
  attempt_count: number
  wrong_count: number
  correct_pct: number
  last_wrong_at: string | null
  dominant_outcome: string | null
  dominant_taxonomy: string | null
  sequence_pattern: SequencePattern | null
  sequence_preview: string
  sequence_switches: number
}

export type WeakTopicRow = {
  subject_id: string | null
  subject_name: string
  topic: string
  wrong: number
  total: number
  correct_pct: number
  level: "critico" | "fragil" | "ok"
}

export type TrendBucket = {
  bucket: string
  attempts: number
  correct: number
  wrong: number
  correct_pct: number
}

export type LabelCount = {
  key: string
  label: string
  count: number
}

export type QuestionStatisticsAnalysisResult = {
  questions: AnalysisQuestionRow[]
  weak_topics: WeakTopicRow[]
  trend: TrendBucket[]
  taxonomy: LabelCount[]
  outcomes: LabelCount[]
  critical_gap_question_ids: string[]
  critical_gaps: Array<{ question_id: string; subject_id: string | null }>
  pareto: {
    topic_count: number
    error_share_pct: number
    topics: string[]
  }
  sequence_patterns: {
    confusao: number
    aprendizado: number
    esquecimento: number
    questions_by_pattern: {
      confusao: AnalysisQuestionRow[]
      aprendizado: AnalysisQuestionRow[]
      esquecimento: AnalysisQuestionRow[]
    }
  }
}

type ResolvedAttempt = {
  question_id: string
  is_correct: boolean
  created_at: string
  outcome_category: string | null
  error_taxonomy: string | null
  subject_id: string | null
  subject_name: string
  tec_subject: string | null
  tec_topic: string
  statement: string
}

function bucketKey(date: Date, period: StatsPeriod): string {
  if (period === "7d" || period === "30d") {
    return date.toISOString().slice(0, 10)
  }
  // weekly: Monday of week
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function weakLevel(correctPct: number, total: number): WeakTopicRow["level"] {
  if (total < 5) return "ok"
  if (correctPct < 45) return "critico"
  if (correctPct < 60) return "fragil"
  return "ok"
}

function dominantKey(counts: Map<string, number>): string | null {
  let best: string | null = null
  let bestN = 0
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  return best
}

export async function fetchQuestionStatisticsAnalysis(
  userId: string,
  opts: { period?: StatsPeriod; subjectIds?: string[] } = {}
): Promise<QuestionStatisticsAnalysisResult> {
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
      outcome_category, error_taxonomy,
      questions ( statement, tec_subject, tec_topic )
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
  const resolved: ResolvedAttempt[] = []

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

    const subjectName = subjectId
      ? (subjectById.get(subjectId) ?? "Sem matéria")
      : "Sem matéria vinculada"

    resolved.push({
      question_id: a.question_id,
      is_correct: a.is_correct,
      created_at: a.created_at,
      outcome_category: a.outcome_category,
      error_taxonomy: a.error_taxonomy,
      subject_id: subjectId,
      subject_name: subjectName,
      tec_subject: q?.tec_subject ?? null,
      tec_topic: topic,
      statement: q?.statement ?? "",
    })
  }

  // Per-question aggregation
  type QAgg = {
    attempt_count: number
    wrong_count: number
    last_wrong_at: string | null
    subject_id: string | null
    subject_name: string
    tec_subject: string | null
    tec_topic: string
    statement: string
    outcomes: Map<string, number>
    taxonomies: Map<string, number>
    critical: boolean
    seq: boolean[]
  }

  const byQuestion = new Map<string, QAgg>()

  for (const a of resolved) {
    const g = byQuestion.get(a.question_id) ?? {
      attempt_count: 0,
      wrong_count: 0,
      last_wrong_at: null,
      subject_id: a.subject_id,
      subject_name: a.subject_name,
      tec_subject: a.tec_subject,
      tec_topic: a.tec_topic,
      statement: a.statement,
      outcomes: new Map(),
      taxonomies: new Map(),
      critical: false,
      seq: [] as boolean[],
    }
    g.attempt_count++
    g.seq.push(a.is_correct)
    if (!a.is_correct) {
      g.wrong_count++
      g.last_wrong_at = a.created_at
      if (a.error_taxonomy && a.error_taxonomy !== "nao_aplicavel") {
        g.taxonomies.set(
          a.error_taxonomy,
          (g.taxonomies.get(a.error_taxonomy) ?? 0) + 1
        )
      }
    }
    if (a.outcome_category) {
      g.outcomes.set(
        a.outcome_category,
        (g.outcomes.get(a.outcome_category) ?? 0) + 1
      )
      if (a.outcome_category === "lacuna_critica") g.critical = true
    }
    // keep latest meta
    g.subject_id = a.subject_id
    g.subject_name = a.subject_name
    g.tec_subject = a.tec_subject
    g.tec_topic = a.tec_topic
    if (a.statement) g.statement = a.statement
    byQuestion.set(a.question_id, g)
  }

  const questions: AnalysisQuestionRow[] = [...byQuestion.entries()]
    .filter(([, g]) => g.wrong_count >= 1)
    .map(([question_id, g]) => {
      const correct = g.attempt_count - g.wrong_count
      const seqResult = classifySequencePattern(g.seq)
      return {
        question_id,
        statement_preview: stripHtml(g.statement).slice(0, 160),
        tec_subject: g.tec_subject,
        tec_topic: g.tec_topic,
        subject_id: g.subject_id,
        subject_name: g.subject_name,
        attempt_count: g.attempt_count,
        wrong_count: g.wrong_count,
        correct_pct:
          g.attempt_count > 0
            ? Math.round((correct / g.attempt_count) * 1000) / 10
            : 0,
        last_wrong_at: g.last_wrong_at,
        dominant_outcome: dominantKey(g.outcomes),
        dominant_taxonomy: dominantKey(g.taxonomies),
        sequence_pattern: seqResult.pattern,
        sequence_preview: seqResult.sequence_preview,
        sequence_switches: seqResult.switches,
      }
    })
    .sort((a, b) => {
      if (b.wrong_count !== a.wrong_count) return b.wrong_count - a.wrong_count
      return b.attempt_count - a.attempt_count
    })
    .slice(0, 100)

  const critical_gaps = [...byQuestion.entries()]
    .filter(([, g]) => g.critical && g.wrong_count >= 1)
    .sort((a, b) => b[1].wrong_count - a[1].wrong_count)
    .slice(0, 50)
    .map(([id, g]) => ({ question_id: id, subject_id: g.subject_id }))

  const critical_gap_question_ids = critical_gaps.map((c) => c.question_id)

  // Weak topics
  const topicAgg = new Map<
    string,
    { subject_id: string | null; subject_name: string; topic: string; correct: number; wrong: number }
  >()

  for (const a of resolved) {
    const key = `${a.subject_id ?? "__none__"}||${a.tec_topic}`
    const g = topicAgg.get(key) ?? {
      subject_id: a.subject_id,
      subject_name: a.subject_name,
      topic: a.tec_topic,
      correct: 0,
      wrong: 0,
    }
    if (a.is_correct) g.correct++
    else g.wrong++
    topicAgg.set(key, g)
  }

  const weak_topics: WeakTopicRow[] = [...topicAgg.values()]
    .map((g) => {
      const total = g.correct + g.wrong
      const correct_pct =
        total > 0 ? Math.round((g.correct / total) * 1000) / 10 : 0
      return {
        subject_id: g.subject_id,
        subject_name: g.subject_name,
        topic: g.topic,
        wrong: g.wrong,
        total,
        correct_pct,
        level: weakLevel(correct_pct, total),
      }
    })
    .filter((t) => t.total >= 5 && t.wrong > 0)
    .sort((a, b) => a.correct_pct - b.correct_pct || b.wrong - a.wrong)
    .slice(0, 40)

  // Trend
  const trendMap = new Map<string, { correct: number; wrong: number }>()
  for (const a of resolved) {
    const key = bucketKey(new Date(a.created_at), period)
    const g = trendMap.get(key) ?? { correct: 0, wrong: 0 }
    if (a.is_correct) g.correct++
    else g.wrong++
    trendMap.set(key, g)
  }

  const trend: TrendBucket[] = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, g]) => {
      const attempts = g.correct + g.wrong
      return {
        bucket,
        attempts,
        correct: g.correct,
        wrong: g.wrong,
        correct_pct:
          attempts > 0 ? Math.round((g.correct / attempts) * 1000) / 10 : 0,
      }
    })

  // Taxonomy & outcomes (wrong attempts for taxonomy; all for outcomes)
  const taxCounts = new Map<string, number>()
  const outcomeCounts = new Map<string, number>()
  for (const a of resolved) {
    if (a.outcome_category) {
      outcomeCounts.set(
        a.outcome_category,
        (outcomeCounts.get(a.outcome_category) ?? 0) + 1
      )
    }
    if (
      !a.is_correct &&
      a.error_taxonomy &&
      a.error_taxonomy !== "nao_aplicavel"
    ) {
      taxCounts.set(
        a.error_taxonomy,
        (taxCounts.get(a.error_taxonomy) ?? 0) + 1
      )
    }
  }

  const taxonomy: LabelCount[] = [...taxCounts.entries()]
    .map(([key, count]) => ({
      key,
      label:
        ERROR_TAXONOMY_LABELS[key as keyof typeof ERROR_TAXONOMY_LABELS] ?? key,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  const outcomes: LabelCount[] = [...outcomeCounts.entries()]
    .map(([key, count]) => ({
      key,
      label: OUTCOME_CATEGORY_LABELS[key] ?? key,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  // Pareto: few topics concentrate most errors
  const topicWrong = [...topicAgg.values()]
    .filter((t) => t.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong)
  const totalWrong = topicWrong.reduce((s, t) => s + t.wrong, 0)
  let cumWrong = 0
  const paretoTopics: string[] = []
  for (const t of topicWrong) {
    if (cumWrong >= totalWrong * 0.6 && paretoTopics.length >= 1) break
    if (paretoTopics.length >= 5) break
    cumWrong += t.wrong
    paretoTopics.push(
      t.subject_name !== "Sem matéria vinculada"
        ? `${t.topic} (${t.subject_name})`
        : t.topic
    )
    if (cumWrong >= totalWrong * 0.8) break
  }

  const pareto = {
    topic_count: paretoTopics.length,
    error_share_pct:
      totalWrong > 0 ? Math.round((cumWrong / totalWrong) * 1000) / 10 : 0,
    topics: paretoTopics,
  }

  const byPattern = {
    confusao: questions.filter((q) => q.sequence_pattern === "confusao"),
    aprendizado: questions.filter((q) => q.sequence_pattern === "aprendizado"),
    esquecimento: questions.filter((q) => q.sequence_pattern === "esquecimento"),
  }

  const sequence_patterns = {
    confusao: byPattern.confusao.length,
    aprendizado: byPattern.aprendizado.length,
    esquecimento: byPattern.esquecimento.length,
    questions_by_pattern: {
      confusao: byPattern.confusao.slice(0, 15),
      aprendizado: byPattern.aprendizado.slice(0, 15),
      esquecimento: byPattern.esquecimento.slice(0, 15),
    },
  }

  return {
    questions,
    weak_topics,
    trend,
    taxonomy,
    outcomes,
    critical_gap_question_ids,
    critical_gaps,
    pareto,
    sequence_patterns,
  }
}
