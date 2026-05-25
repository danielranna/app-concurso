import { supabaseServer } from "../supabase-server"
import type {
  ErrorTaxonomy,
  LearningSignal,
  NotebookReportStructured,
  SubjectBrainState,
  TopicBrainEntry,
} from "../coach-types"
import { loadMappings } from "../tec-mapping"
import { buildBrainContext } from "./context-builder"
import { loadSubjectBrain } from "./context-builder"
import { runBrainNarrativeAgent } from "./agents/brain"
import {
  computeLearningSignals,
  getTopicStatsForSubject,
} from "../learning-signals"
import {
  applyLearningSignalsToBrain,
  applyPredominantErrors,
  buildRuleBasedBrainSummary,
  computeDominioDelta,
  mergeBrainNarrative,
  mergeReportIntoBrain,
  topicBrainKey,
} from "./brain-helpers"

type AttemptRow = {
  question_id: string
  is_correct: boolean
  created_at: string
  tec_topic: string
}

function dominioFromStats(correct: number, wrong: number): number {
  const total = correct + wrong
  if (total === 0) return 0.5
  return correct / total
}

export function estabilidadeFromAttempts(
  rows: { is_correct: boolean }[]
): number {
  if (rows.length < 2) return 0.3
  let flips = 0
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.is_correct !== rows[i - 1]!.is_correct) flips++
  }
  return Math.max(0, 1 - flips / (rows.length - 1))
}

function statusFromMetrics(
  dominio: number,
  estabilidade: number,
  wrong: number
): TopicBrainEntry["status"] {
  if (dominio >= 0.85 && estabilidade >= 0.7) return "dominado"
  if (dominio >= 0.7 && estabilidade >= 0.5) return "forte"
  if (dominio >= 0.55 && estabilidade < 0.45) return "instavel"
  if (dominio < 0.45 && wrong >= 3) return "critico"
  if (dominio >= 0.6 && estabilidade < 0.35) return "ilusao_dominio"
  if (dominio < 0.55) return "fraco"
  return "em_evolucao"
}

async function fetchSubjectAttempts(
  userId: string,
  subjectId: string
): Promise<AttemptRow[]> {
  const mappings = await loadMappings(userId)
  const tecSubjects = new Set(
    mappings
      .filter((m) => m.subject_id === subjectId)
      .map((m) => (m.tec_subject ?? "").trim())
      .filter(Boolean)
  )
  if (!tecSubjects.size) return []

  const { data: attempts, error } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      question_id, is_correct, created_at,
      questions ( tec_subject, tec_topic )
    `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  const rows: AttemptRow[] = []
  for (const a of attempts ?? []) {
    const q = a.questions as
      | { tec_subject?: string; tec_topic?: string }
      | { tec_subject?: string; tec_topic?: string }[]
    const qu = Array.isArray(q) ? q[0] : q
    if (!qu || !tecSubjects.has((qu.tec_subject ?? "").trim())) continue
    rows.push({
      question_id: a.question_id,
      is_correct: a.is_correct,
      created_at: a.created_at,
      tec_topic: qu.tec_topic?.trim() || "Sem tópico",
    })
  }
  return rows
}

async function fetchTaxonomyBySubject(
  userId: string,
  subjectId: string
): Promise<Map<string, Map<string, number>>> {
  const mappings = await loadMappings(userId)
  const tecSubjects = new Set(
    mappings
      .filter((m) => m.subject_id === subjectId)
      .map((m) => (m.tec_subject ?? "").trim())
      .filter(Boolean)
  )

  const { data: taxonomyRows } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      error_taxonomy, is_correct,
      questions!inner ( tec_topic, tec_subject )
    `
    )
    .eq("user_id", userId)
    .not("error_taxonomy", "is", null)
    .eq("is_correct", false)
    .limit(500)

  const errorByTopic = new Map<string, Map<string, number>>()
  for (const row of taxonomyRows ?? []) {
    const q = row.questions as { tec_topic?: string; tec_subject?: string } | { tec_topic?: string; tec_subject?: string }[]
    const qu = Array.isArray(q) ? q[0] : q
    if (!qu || !tecSubjects.has((qu.tec_subject ?? "").trim())) continue
    const topic = qu.tec_topic?.trim() || "Sem tópico"
    const tax = row.error_taxonomy as string
    const m = errorByTopic.get(topic) ?? new Map()
    m.set(tax, (m.get(tax) ?? 0) + 1)
    errorByTopic.set(topic, m)
  }
  return errorByTopic
}

export type ComputeBrainOptions = {
  reportId?: string
  reportStructured?: NotebookReportStructured | null
  previousBrain?: SubjectBrainState | null
  learningSignals?: LearningSignal[]
}

export async function computeSubjectBrainState(
  userId: string,
  subjectId: string,
  options?: ComputeBrainOptions
): Promise<SubjectBrainState> {
  const [topicStats, subjectAttempts, errorByTopic, signals] = await Promise.all([
    getTopicStatsForSubject(userId, subjectId),
    fetchSubjectAttempts(userId, subjectId),
    fetchTaxonomyBySubject(userId, subjectId),
    options?.learningSignals
      ? Promise.resolve(options.learningSignals)
      : computeLearningSignals(userId, subjectId),
  ])

  const attemptsByTopicKey = new Map<string, AttemptRow[]>()
  const displayLabelByKey = new Map<string, string>()

  for (const a of subjectAttempts) {
    const key = topicBrainKey(a.tec_topic)
    if (!displayLabelByKey.has(key)) displayLabelByKey.set(key, a.tec_topic)
    const list = attemptsByTopicKey.get(key) ?? []
    list.push(a)
    attemptsByTopicKey.set(key, list)
  }

  const topic_map: Record<string, TopicBrainEntry> = {}
  const danger_topics: string[] = []

  const statsByKey = new Map(
    topicStats.map((t) => [topicBrainKey(t.topic), t])
  )

  const allKeys = new Set([
    ...statsByKey.keys(),
    ...attemptsByTopicKey.keys(),
    ...[...errorByTopic.keys()].map(topicBrainKey),
  ])

  for (const key of allKeys) {
    const stat = statsByKey.get(key)
    const attempts = attemptsByTopicKey.get(key) ?? []
    const display =
      displayLabelByKey.get(key) ?? stat?.topic ?? key

    const dominio = stat
      ? dominioFromStats(stat.correct, stat.wrong)
      : attempts.length
        ? dominioFromStats(
            attempts.filter((x) => x.is_correct).length,
            attempts.filter((x) => !x.is_correct).length
          )
        : 0.5

    const estabilidade =
      attempts.length >= 2
        ? estabilidadeFromAttempts(attempts)
        : stat && stat.correct + stat.wrong >= 2
          ? 0.35 + dominio * 0.25
          : 0.3

    const wrong = stat?.wrong ?? attempts.filter((x) => !x.is_correct).length
    const status = statusFromMetrics(dominio, estabilidade, wrong)

    topic_map[key] = {
      label: display,
      status,
      dominio: Math.round(dominio * 100) / 100,
      estabilidade: Math.round(estabilidade * 100) / 100,
      retencao: Math.round((dominio * 0.6 + estabilidade * 0.4) * 100) / 100,
    }

    if (status === "critico" || status === "ilusao_dominio") {
      danger_topics.push(key)
    }
  }

  applyPredominantErrors(errorByTopic, topic_map)

  const reportMerged = mergeReportIntoBrain({
    topic_map,
    danger_topics,
    structured: options?.reportStructured,
  })

  applyLearningSignalsToBrain({ topic_map, danger_topics, signals })

  const sorted = [...statsByKey.entries()].sort(
    (a, b) => dominioFromStats(a[1].correct, a[1].wrong) - dominioFromStats(b[1].correct, b[1].wrong)
  )
  const weak = sorted.slice(0, 3).map(([, t]) => dominioFromStats(t.correct, t.wrong))
  const strong = sorted.slice(-3).map(([, t]) => dominioFromStats(t.correct, t.wrong))
  let trend: SubjectBrainState["trend"] =
    weak.length && strong.length && strong[strong.length - 1]! > weak[0]! + 0.15
      ? "melhorando"
      : weak[0]! < 0.4
        ? "piorando"
        : "estagnado"

  const dominio_delta = computeDominioDelta(options?.previousBrain, topic_map)
  if (Object.values(dominio_delta).some((d) => d > 0.08)) trend = "melhorando"
  if (Object.values(dominio_delta).some((d) => d < -0.08)) trend = "piorando"

  const error_profile_by_topic: Record<string, ErrorTaxonomy> = {}
  for (const [key, entry] of Object.entries(topic_map)) {
    if (entry.predominant_error) {
      error_profile_by_topic[key] = entry.predominant_error
    }
  }

  return {
    topic_map,
    error_profile_by_topic,
    danger_topics: [...new Set(danger_topics)].slice(0, 12),
    trend,
    last_report_id: options?.reportId,
    dominio_delta,
    report_merged: reportMerged,
    computed_at: new Date().toISOString(),
  }
}

export type PersistBrainResult = {
  state: SubjectBrainState
  summaryMd: string
  usedLlm: boolean
  reportMerged: boolean
}

export async function persistSubjectBrain(params: {
  userId: string
  subjectId: string
  reportId?: string
  reportStructured?: NotebookReportStructured | null
  skipLlm?: boolean
}): Promise<PersistBrainResult> {
  const previousBrain = await loadSubjectBrain(params.userId, params.subjectId)

  const { data: subject } = await supabaseServer
    .from("subjects")
    .select("name")
    .eq("id", params.subjectId)
    .maybeSingle()

  let structured = params.reportStructured
  if (params.reportId && !structured) {
    const { data: reportRow } = await supabaseServer
      .from("subject_notebook_reports")
      .select("structured")
      .eq("id", params.reportId)
      .maybeSingle()
    structured = (reportRow?.structured as NotebookReportStructured) ?? null
  }

  const baseState = await computeSubjectBrainState(params.userId, params.subjectId, {
    reportId: params.reportId,
    reportStructured: structured,
    previousBrain,
  })

  const context = await buildBrainContext(params.userId, params.subjectId)

  const narrativeResult = params.skipLlm
    ? { summaryMd: "", usedLlm: false, danger_topics_add: [] as string[] }
    : await runBrainNarrativeAgent({
        userId: params.userId,
        subjectId: params.subjectId,
        state: baseState,
        context: context as unknown as Record<string, unknown>,
      }).catch(() => ({
        summaryMd: "",
        usedLlm: false,
        danger_topics_add: [] as string[],
      }))

  const { state, summaryMd } = mergeBrainNarrative(
    baseState,
    {
      summary_md: narrativeResult.summaryMd,
      trend: narrativeResult.trend,
      danger_topics_add: narrativeResult.danger_topics_add,
    },
    subject?.name
  )

  await supabaseServer.from("subject_brain_state").upsert(
    {
      user_id: params.userId,
      subject_id: params.subjectId,
      state,
      summary_md: summaryMd,
      last_report_id: params.reportId ?? state.last_report_id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,subject_id" }
  )

  return {
    state,
    summaryMd,
    usedLlm: narrativeResult.usedLlm ?? false,
    reportMerged: Boolean(baseState.report_merged),
  }
}

export async function ingestBrainFromReport(
  userId: string,
  subjectId: string,
  reportId: string
) {
  const result = await persistSubjectBrain({
    userId,
    subjectId,
    reportId,
  })
  return result.state
}

export async function recomputeSubjectBrain(
  userId: string,
  subjectId: string,
  options?: { skipLlm?: boolean }
) {
  return persistSubjectBrain({
    userId,
    subjectId,
    skipLlm: options?.skipLlm,
  })
}
