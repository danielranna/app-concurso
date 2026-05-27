import { supabaseServer } from "../supabase-server"
import type {
  ErrorTaxonomy,
  LearningSignal,
  LearningSignalType,
  SubjectBrainState,
  TopicBrainEntry,
} from "../coach-types"
import {
  computeLearningSignals,
  getTopicStatsForSubject,
} from "../learning-signals"
import { isSubjectLevelMapping, loadMappings } from "../tec-mapping"
import { topicBrainKey } from "./brain-helpers"
import { computePriorityBreakdown, type PriorityBreakdownRow } from "./priority-breakdown"

type QuestionMeta = {
  id?: string
  tec_id: number
  tec_url?: string
  tec_subject: string
  tec_topic: string
  statement?: string
}

type AttemptRow = {
  question_id: string
  is_correct: boolean
  duration_ms: number | null
  confidence_level: string | null
  outcome_category: string | null
  error_taxonomy: string | null
  created_at: string
  questions: QuestionMeta | null
}

function unwrapQ(
  q: QuestionMeta | QuestionMeta[] | null | undefined
): QuestionMeta | null {
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : q
}

function normKey(s: string) {
  return (s ?? "").trim()
}

async function fetchSubjectAttemptsFull(
  userId: string,
  subjectId: string
): Promise<{ attempts: AttemptRow[]; tecSubjects: string[]; questionIds: string[] }> {
  const mappings = await loadMappings(userId)
  const subjectMappings = mappings.filter((m) => m.subject_id === subjectId)
  const tecSubjects = [
    ...new Set(
      subjectMappings
        .filter((m) => isSubjectLevelMapping(m.tec_topic))
        .map((m) => normKey(m.tec_subject))
        .filter(Boolean)
    ),
  ]

  if (!tecSubjects.length) {
    return { attempts: [], tecSubjects: [], questionIds: [] }
  }

  const { data: questions } = await supabaseServer
    .from("questions")
    .select("id, tec_id, tec_url, tec_subject, tec_topic, statement")
    .in("tec_subject", tecSubjects)

  const questionIds = (questions ?? []).map((q) => q.id)
  if (!questionIds.length) {
    return { attempts: [], tecSubjects, questionIds: [] }
  }

  const { data: attemptsRaw, error } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      question_id, is_correct, duration_ms, confidence_level,
      outcome_category, error_taxonomy, created_at,
      questions ( id, tec_id, tec_url, tec_subject, tec_topic, statement )
    `
    )
    .eq("user_id", userId)
    .in("question_id", questionIds)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  const attempts = (attemptsRaw ?? []).map((a) => ({
    ...a,
    questions: unwrapQ(a.questions as QuestionMeta | QuestionMeta[] | null),
  })) as AttemptRow[]

  return { attempts, tecSubjects, questionIds }
}

export type BrainDetailTopicRow = {
  topic_key: string
  label: string
  status: TopicBrainEntry["status"] | "sem_dados"
  dominio: number
  estabilidade: number
  retencao: number
  dominio_delta?: number
  correct: number
  wrong: number
  total_attempts: number
  predominant_error?: ErrorTaxonomy
  last_insight?: string
  is_danger: boolean
  signal_types: LearningSignalType[]
}

export type BrainDetailPayload = {
  subject_id: string
  subject_name: string
  brain: SubjectBrainState | null
  summary_md: string | null
  updated_at: string | null
  last_report_id: string | null
  overview: {
    total_attempts: number
    correct: number
    wrong: number
    topic_count: number
    topics_strong: number
    topics_weak: number
    danger_topics_count: number
    signals_count: number
    reports_count: number
    report_merged: boolean
    trend: string
  }
  topics: BrainDetailTopicRow[]
  status_distribution: { status: string; count: number }[]
  signals: LearningSignal[]
  outcome_distribution: { key: string; count: number }[]
  error_taxonomy_distribution: { key: string; count: number }[]
  recent_reports: {
    id: string
    headline: string | null
    created_at: string
    notebook_name: string | null
    is_last_report: boolean
  }[]
  brain_performance_top: PriorityBreakdownRow[]
  mapping_status: {
    mapped_tec_subjects: string[]
    has_mapping: boolean
    unmapped_hint: boolean
  }
}

function signalsForTopic(
  signals: LearningSignal[],
  topicKey: string,
  topicLabel: string
): LearningSignalType[] {
  const types = new Set<LearningSignalType>()
  for (const s of signals) {
    const metaTopic = s.metadata?.tec_topic as string | undefined
    const matchTopic =
      s.entity_type === "tec_topic" &&
      topicBrainKey(s.entity_id) === topicKey
    const matchMeta =
      metaTopic &&
      (topicBrainKey(metaTopic) === topicKey ||
        topicBrainKey(metaTopic) === topicBrainKey(topicLabel))
    if (matchTopic || matchMeta) types.add(s.signal_type)
  }
  return [...types]
}

function buildTopicsMerged(
  brain: SubjectBrainState | null,
  topicStats: Awaited<ReturnType<typeof getTopicStatsForSubject>>,
  signals: LearningSignal[],
  dangerSet: Set<string>
): BrainDetailTopicRow[] {
  const statsByKey = new Map(
    topicStats.map((t) => [topicBrainKey(t.topic), t])
  )
  const allKeys = new Set<string>([
    ...Object.keys(brain?.topic_map ?? {}),
    ...statsByKey.keys(),
  ])

  const rows: BrainDetailTopicRow[] = []

  for (const key of allKeys) {
    const entry = brain?.topic_map[key]
    const stat = statsByKey.get(key)
    const label = entry?.label ?? stat?.topic ?? key
    const correct = stat?.correct ?? 0
    const wrong = stat?.wrong ?? 0
    const total = correct + wrong

    rows.push({
      topic_key: key,
      label,
      status: entry?.status ?? (total > 0 ? "em_evolucao" : "sem_dados"),
      dominio: entry?.dominio ?? (total > 0 ? correct / total : 0.5),
      estabilidade: entry?.estabilidade ?? 0.3,
      retencao: entry?.retencao ?? 0.3,
      dominio_delta: brain?.dominio_delta?.[key],
      correct,
      wrong,
      total_attempts: total,
      predominant_error: entry?.predominant_error,
      last_insight: entry?.last_insight,
      is_danger: dangerSet.has(key),
      signal_types: signalsForTopic(signals, key, label),
    })
  }

  return rows.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}

export async function buildBrainDetailPayload(
  userId: string,
  subjectId: string
): Promise<BrainDetailPayload> {
  const [subjectRes, brainRes, mappings] = await Promise.all([
    supabaseServer
      .from("subjects")
      .select("name")
      .eq("id", subjectId)
      .maybeSingle(),
    supabaseServer
      .from("subject_brain_state")
      .select("state, summary_md, updated_at, last_report_id")
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .maybeSingle(),
    loadMappings(userId),
  ])

  const subject = subjectRes.data
  const brainRow = brainRes.data
  const brain = (brainRow?.state as SubjectBrainState) ?? null
  const summary_md = brainRow?.summary_md ?? null
  const updated_at = brainRow?.updated_at ?? null
  const last_report_id = brainRow?.last_report_id ?? null

  const mappedTecSubjects = mappings
    .filter(
      (m) =>
        m.subject_id === subjectId && isSubjectLevelMapping(m.tec_topic)
    )
    .map((m) => normKey(m.tec_subject))
    .filter(Boolean)

  const [{ attempts }, topicStats, signals, breakdown] = await Promise.all([
    fetchSubjectAttemptsFull(userId, subjectId),
    getTopicStatsForSubject(userId, subjectId),
    computeLearningSignals(userId, subjectId),
    computePriorityBreakdown(userId, subjectId).catch(() => null),
  ])

  const dangerSet = new Set(brain?.danger_topics ?? [])
  const topics = buildTopicsMerged(brain, topicStats, signals, dangerSet)

  const strongStatuses = new Set(["dominado", "forte"])
  const weakStatuses = new Set(["fraco", "critico", "ilusao_dominio"])

  let correct = 0
  let wrong = 0
  const outcomeCounts = new Map<string, number>()
  const errorTaxCounts = new Map<string, number>()

  for (const a of attempts) {
    if (a.is_correct) correct++
    else wrong++
    const oc = a.outcome_category ?? "unknown"
    outcomeCounts.set(oc, (outcomeCounts.get(oc) ?? 0) + 1)
    if (!a.is_correct && a.error_taxonomy) {
      errorTaxCounts.set(
        a.error_taxonomy,
        (errorTaxCounts.get(a.error_taxonomy) ?? 0) + 1
      )
    }
  }

  const statusCounts = new Map<string, number>()
  for (const t of topics) {
    statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1)
  }

  const { count: reportsCount } = await supabaseServer
    .from("subject_notebook_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("subject_id", subjectId)

  const { data: recentReportsRaw } = await supabaseServer
    .from("subject_notebook_reports")
    .select(
      `
      id, summary_md, structured, created_at,
      notebooks ( name )
    `
    )
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(5)

  const recent_reports = (recentReportsRaw ?? []).map((r) => {
    const structured = r.structured as { headline?: string } | null
    const nb = r.notebooks as { name: string } | { name: string }[] | null
    const notebookName = Array.isArray(nb) ? nb[0]?.name : nb?.name
    return {
      id: r.id,
      headline:
        structured?.headline ??
        (r.summary_md ? r.summary_md.slice(0, 80) : null),
      created_at: r.created_at,
      notebook_name: notebookName ?? null,
      is_last_report: r.id === last_report_id,
    }
  })

  return {
    subject_id: subjectId,
    subject_name: subject?.name ?? "Matéria",
    brain,
    summary_md,
    updated_at,
    last_report_id,
    overview: {
      total_attempts: correct + wrong,
      correct,
      wrong,
      topic_count: topics.length,
      topics_strong: topics.filter((t) => strongStatuses.has(t.status)).length,
      topics_weak: topics.filter((t) => weakStatuses.has(t.status)).length,
      danger_topics_count: dangerSet.size,
      signals_count: signals.length,
      reports_count: reportsCount ?? 0,
      report_merged: Boolean(brain?.report_merged),
      trend: brain?.trend ?? "desconhecido",
    },
    topics,
    status_distribution: [...statusCounts.entries()].map(([status, count]) => ({
      status,
      count,
    })),
    signals,
    outcome_distribution: [...outcomeCounts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    error_taxonomy_distribution: [...errorTaxCounts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    recent_reports,
    brain_performance_top: (breakdown?.brain_performance ?? []).slice(0, 8),
    mapping_status: {
      mapped_tec_subjects: mappedTecSubjects,
      has_mapping: mappedTecSubjects.length > 0,
      unmapped_hint: mappedTecSubjects.length === 0,
    },
  }
}

export type BrainTopicQuestionRow = {
  question_id: string
  tec_id: number
  tec_url: string
  statement_excerpt: string
  attempt_count: number
  wrong_count: number
  last_is_correct: boolean
  last_outcome_category: string | null
  last_confidence: string | null
  error_taxonomy: string | null
  signal_types: LearningSignalType[]
  tec_subject: string | null
  tec_topic: string | null
}

export async function fetchBrainTopicQuestions(
  userId: string,
  subjectId: string,
  topicKey: string
): Promise<BrainTopicQuestionRow[]> {
  const { attempts } = await fetchSubjectAttemptsFull(userId, subjectId)
  const signals = await computeLearningSignals(userId, subjectId)

  const byQuestion = new Map<
    string,
    {
      attempts: AttemptRow[]
      meta: QuestionMeta | null
    }
  >()

  for (const a of attempts) {
    const q = a.questions
    if (!q) continue
    const key = topicBrainKey(q.tec_topic?.trim() || "Sem tópico")
    if (key !== topicKey) continue

    const g = byQuestion.get(a.question_id) ?? { attempts: [], meta: q }
    g.attempts.push(a)
    byQuestion.set(a.question_id, g)
  }

  const rows: BrainTopicQuestionRow[] = []

  for (const [questionId, { attempts: qAttempts, meta }] of byQuestion) {
    const last = qAttempts[qAttempts.length - 1]!
    const wrongCount = qAttempts.filter((x) => !x.is_correct).length
    const questionSignals = signals
      .filter(
        (s) =>
          s.entity_type === "question" && s.entity_id === questionId
      )
      .map((s) => s.signal_type)

    const lastWrongWithTax = [...qAttempts]
      .reverse()
      .find((x) => !x.is_correct && x.error_taxonomy)

    const tecId = meta?.tec_id ?? 0
    rows.push({
      question_id: questionId,
      tec_id: tecId,
      tec_url:
        (meta as { tec_url?: string })?.tec_url ??
        (tecId ? `https://www.tecconcursos.com.br/questoes/${tecId}` : ""),
      statement_excerpt: (meta?.statement ?? "").slice(0, 200),
      attempt_count: qAttempts.length,
      wrong_count: wrongCount,
      last_is_correct: last.is_correct,
      last_outcome_category: last.outcome_category,
      last_confidence: last.confidence_level,
      error_taxonomy: lastWrongWithTax?.error_taxonomy ?? null,
      signal_types: [...new Set(questionSignals)],
      tec_subject: meta?.tec_subject ?? null,
      tec_topic: meta?.tec_topic ?? null,
    })
  }

  return rows.sort((a, b) => {
    if (b.wrong_count !== a.wrong_count) return b.wrong_count - a.wrong_count
    return b.attempt_count - a.attempt_count
  })
}
