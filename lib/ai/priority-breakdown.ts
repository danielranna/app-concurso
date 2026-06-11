import { supabaseServer } from "../supabase-server"
import { computeLearningSignals, getTopicStatsForSubject } from "../learning-signals"
import type { SubjectBrainState, TopicBrainEntry } from "../coach-types"
import { buildIncidencePayloadForExam } from "../coach-documents"
import { fetchIncidenceRows, resolveSubjectLabels } from "../incidence-rows-db"
import { normLabel } from "../incidence-subject-map"
import {
  buildIncidenceTopicIndex,
  deriveDiagnosticState,
  formatPriorityReason,
  getActiveExamTargetId,
  getEditalWeightForSubject,
  matchTopicToIncidence,
  percentToIncidenceWeight,
} from "../strategic-weights"
import { findTopicEntry, topicBrainKey } from "./brain-helpers"
import { loadSubjectBrain } from "./context-builder"
import {
  applyLearningSignalsToScore,
  formatHumanPriorityReason,
  type StrategicQueueRow,
} from "./strategy-helpers"

export type PriorityBreakdownRow = {
  topic_key: string
  topic_label: string
  score: number
  edital_weight: number
  incidence_weight: number
  edital_incidence_score: number
  brain_urgency_score?: number
  dominio?: number
  attempts: number
  wrong_count: number
  brain_status?: string
  gap_score?: number
  retention_penalty?: number
  reason?: string
  rank?: number
}

export type PriorityBreakdown = {
  subject_name: string
  edital_incidence: PriorityBreakdownRow[]
  brain_performance: PriorityBreakdownRow[]
  crossed: PriorityBreakdownRow[]
  unattempted_high_incidence: PriorityBreakdownRow[]
  computed_at: string
}

const STATUS_URGENCY: Record<string, number> = {
  critico: 1.45,
  fraco: 1.25,
  instavel: 1.1,
  ilusao_dominio: 1.2,
  em_evolucao: 1.0,
  forte: 0.75,
  dominado: 0.55,
}

type TopicAccumulator = {
  displayLabel: string
  wrong: number
  correct: number
  fromIncidence: boolean
}

export function computeBrainUrgencyScore(params: {
  dominio: number
  estabilidade: number
  wrongCount: number
  status?: string
}): number {
  const gap = Math.max(0.15, 1 - params.dominio)
  const retentionPenalty =
    params.estabilidade < 0.4 ? 1.4 : params.estabilidade < 0.6 ? 1.15 : 1
  const wrongFactor = 1 + Math.min(0.3, params.wrongCount * 0.05)
  const statusWeight = STATUS_URGENCY[params.status ?? ""] ?? 1
  const raw = gap * retentionPenalty * wrongFactor * statusWeight
  return Math.round(raw * 1000) / 1000
}

function resolveDominioAndBrain(
  brain: SubjectBrainState | null,
  topicLabel: string,
  topicNorm: string,
  statsDominio: number,
  attempts: number
): {
  dominio: number
  estabilidade: number
  gap_score: number
  brainEntry: TopicBrainEntry | null
} {
  let brainEntry: TopicBrainEntry | null = null
  if (brain?.topic_map) {
    const found = findTopicEntry(brain.topic_map, topicLabel)
    brainEntry = found?.[1] ?? brain.topic_map[topicNorm] ?? null
  }
  const dominio =
    brainEntry?.dominio ??
    (attempts > 0 ? statsDominio : 0.5)
  const estabilidade = brainEntry?.estabilidade ?? 0.5
  const gap_score = brainEntry ? 1 - brainEntry.dominio : 1 - dominio
  return { dominio, estabilidade, gap_score, brainEntry }
}

export async function computePriorityBreakdown(
  userId: string,
  subjectId: string,
  options?: { recentWrongTopics?: string[] }
): Promise<PriorityBreakdown> {
  const { data: subject } = await supabaseServer
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .single()

  const topicStats = await getTopicStatsForSubject(userId, subjectId)
  const brain = await loadSubjectBrain(userId, subjectId)
  const learningSignals = await computeLearningSignals(userId, subjectId)

  const examId = await getActiveExamTargetId(userId)
  const editalWeight = examId
    ? await getEditalWeightForSubject(userId, examId, subjectId)
    : 1

  const labels = examId
    ? await resolveSubjectLabels(userId, examId, subjectId).catch(() => [] as string[])
    : []

  const incidenceRows =
    examId && labels.length
      ? await fetchIncidenceRows({
          userId,
          examTargetId: examId,
          subjectLabels: labels,
        })
      : []

  const topicIndex = buildIncidenceTopicIndex(
    (incidenceRows ?? []).map((r) => ({
      topic_name: String(r.topic_name),
      percent: Number(r.percent),
      is_subtopic: Boolean(r.is_subtopic),
    }))
  )

  const incidenceByExactKey = new Map<string, number>()
  for (const [, entry] of topicIndex) {
    incidenceByExactKey.set(
      entry.topic_name,
      percentToIncidenceWeight(entry.percent)
    )
  }

  if (examId && labels.length) {
    try {
      const payload = await buildIncidencePayloadForExam(userId, examId)
      const block = payload.for_llm.find(
        (b) => b.subject_id === subjectId || b.subject_name === subject?.name
      )
      if (block?.top_topics) {
        for (const t of block.top_topics as {
          name?: string
          topic?: string
          percent?: number
        }[]) {
          const key = (t.name ?? t.topic ?? "").trim()
          if (!key) continue
          const w = percentToIncidenceWeight(t.percent ?? 10)
          incidenceByExactKey.set(
            key,
            Math.max(incidenceByExactKey.get(key) ?? 0, w)
          )
        }
      }
    } catch {
      /* no incidence payload */
    }
  }

  const { data: incidenceDocs } = await supabaseServer
    .from("subject_documents")
    .select("parsed_tables")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("doc_type", "incidence")
    .eq("status", "ready")
    .limit(1)

  const pt = (incidenceDocs?.[0]?.parsed_tables ?? {}) as Record<string, unknown>
  const groups = (pt.groups as { name: string; percent: number }[]) ?? []
  for (const g of groups) {
    const key = (g.name ?? "").trim()
    if (key) {
      incidenceByExactKey.set(
        key,
        Math.max(
          incidenceByExactKey.get(key) ?? 0,
          percentToIncidenceWeight(g.percent ?? 5)
        )
      )
    }
  }

  const recentWrong = new Set(
    (options?.recentWrongTopics ?? []).map((t) => topicBrainKey(t))
  )

  const topicKeys = new Map<string, TopicAccumulator>()
  for (const t of topicStats) {
    const key = topicBrainKey(t.topic)
    const existing = topicKeys.get(key)
    topicKeys.set(key, {
      displayLabel: existing?.displayLabel ?? t.topic,
      wrong: (existing?.wrong ?? 0) + t.wrong,
      correct: (existing?.correct ?? 0) + t.correct,
      fromIncidence: existing?.fromIncidence ?? false,
    })
  }
  for (const [name] of topicIndex) {
    const key = topicBrainKey(name)
    const existing = topicKeys.get(key)
    if (existing) {
      existing.fromIncidence = true
    } else {
      topicKeys.set(key, {
        displayLabel: name,
        wrong: 0,
        correct: 0,
        fromIncidence: true,
      })
    }
  }

  const attemptsDistribution = topicStats
    .map((t) => Number(t.correct + t.wrong))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  const p75Attempts =
    attemptsDistribution.length > 0
      ? attemptsDistribution[Math.floor((attemptsDistribution.length - 1) * 0.75)]
      : 0
  const adaptiveValidatedAttempts = Math.min(
    20,
    Math.max(8, Math.round(p75Attempts || 12))
  )
  const adaptiveDevelopingAttempts = Math.max(
    3,
    Math.min(
      adaptiveValidatedAttempts - 1,
      Math.round(adaptiveValidatedAttempts * 0.33)
    )
  )

  const baseRows: PriorityBreakdownRow[] = []

  for (const [topicNorm, t] of topicKeys) {
    const topicLabel = t.displayLabel
    const attempts = t.correct + t.wrong
    const statsDominio =
      attempts > 0 ? t.correct / (t.correct + t.wrong) : 0.5

    const { dominio, estabilidade, gap_score, brainEntry } =
      resolveDominioAndBrain(
        brain,
        topicLabel,
        topicNorm,
        statsDominio,
        attempts
      )

    const retention_penalty =
      estabilidade < 0.4 ? 1.4 : estabilidade < 0.6 ? 1.15 : 1

    const match = matchTopicToIncidence(topicLabel, topicIndex)
    const incidence_weight =
      match.weight > 1 || match.matchedTopic
        ? match.weight
        : incidenceByExactKey.get(topicLabel) ??
          incidenceByExactKey.get(
            [...incidenceByExactKey.keys()].find(
              (k) => normLabel(k) === topicNorm
            ) ?? ""
          ) ??
          1

    const edital_incidence_score =
      Math.round(editalWeight * incidence_weight * 1000) / 1000

    const brain_urgency_score =
      attempts > 0
        ? computeBrainUrgencyScore({
            dominio,
            estabilidade,
            wrongCount: t.wrong,
            status: brainEntry?.status,
          })
        : undefined

    baseRows.push({
      topic_key: topicNorm,
      topic_label: topicLabel,
      score: 0,
      edital_weight: editalWeight,
      incidence_weight,
      edital_incidence_score,
      brain_urgency_score,
      dominio: Math.round(dominio * 100) / 100,
      attempts,
      wrong_count: t.wrong,
      brain_status: brainEntry?.status,
      gap_score: Math.round(gap_score * 100) / 100,
      retention_penalty,
    })
  }

  const edital_incidence = [...baseRows]
    .map((r) => ({ ...r, score: r.edital_incidence_score }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }))

  const brain_performance = baseRows
    .filter((r) => r.attempts > 0 && r.brain_urgency_score != null)
    .map((r) => ({ ...r, score: r.brain_urgency_score! }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }))

  const unattempted_high_incidence = edital_incidence
    .filter((r) => r.attempts === 0)
    .slice(0, 40)

  const crossed: PriorityBreakdownRow[] = []
  for (const r of baseRows) {
    if (r.attempts === 0 || r.brain_urgency_score == null) continue

    let crossedScore =
      Math.round(r.edital_incidence_score * r.brain_urgency_score * 1000) /
      1000

    crossedScore = applyLearningSignalsToScore(
      crossedScore,
      r.topic_key,
      learningSignals
    )

    if (recentWrong.has(r.topic_key)) {
      crossedScore = Math.round(crossedScore * 1.2 * 1000) / 1000
    }

    if (crossedScore < 0.15 && (r.dominio ?? 0) > 0.85) continue

    const hasMaterialCoverage = true
    const diagnosticState = deriveDiagnosticState({
      attempts: r.attempts,
      hasCoverage: hasMaterialCoverage,
      thresholds: {
        developingAttempts: adaptiveDevelopingAttempts,
        validatedAttempts: adaptiveValidatedAttempts,
      },
    })

    const humanReason = formatHumanPriorityReason({
      editalWeight: r.edital_weight,
      incidenceWeight: r.incidence_weight,
      gapScore: r.gap_score ?? 0,
      retentionPenalty: r.retention_penalty ?? 1,
      wrongCount: r.wrong_count,
      recentBoost: recentWrong.has(r.topic_key),
      topicLabel: r.topic_label,
    })

    const sqlReason = formatPriorityReason({
      relevanceScore: r.edital_incidence_score,
      masteryGapScore: r.brain_urgency_score,
      evidenceScore: 1,
      coveragePenalty: 1,
      diagnosticState,
      availableQuestionCount: r.attempts,
      hasMaterialCoverage,
      retentionPenalty: r.retention_penalty ?? 1,
    })

    crossed.push({
      ...r,
      score: crossedScore,
      reason: `${humanReason} [rank=cross; ${sqlReason}]`,
    })
  }

  crossed.sort((a, b) => b.score - a.score)
  const crossedRanked = crossed.map((r, i) => ({ ...r, rank: i + 1 }))

  return {
    subject_name: subject?.name ?? "Matéria",
    edital_incidence,
    brain_performance,
    crossed: crossedRanked,
    unattempted_high_incidence,
    computed_at: new Date().toISOString(),
  }
}

/** Converte linhas cruzadas para persistência em strategic_queue_items */
export function crossedRowsToStrategicQueue(
  userId: string,
  subjectId: string,
  crossed: PriorityBreakdownRow[],
  recentBoostKeys: Set<string>
): StrategicQueueRow[] {
  return crossed.map((r) => ({
    user_id: userId,
    subject_id: subjectId,
    topic_key: r.topic_key,
    topic_label: r.topic_label,
    priority_score: r.score,
    incidence_weight: r.incidence_weight,
    edital_weight: r.edital_weight,
    gap_score: r.gap_score ?? 0,
    retention_penalty: r.retention_penalty ?? 1,
    reason: r.reason ?? "",
    source: "sql",
    computed_at: new Date().toISOString(),
    recent_boost: recentBoostKeys.has(r.topic_key),
    priority_source: "crossed" as const,
  }))
}

/** Pré-edital: fila só por fraqueza (cérebro), sem incidência. */
export function brainRowsToStrategicQueue(
  userId: string,
  subjectId: string,
  brain: PriorityBreakdownRow[],
  recentBoostKeys: Set<string>
): StrategicQueueRow[] {
  return brain.map((r) => ({
    user_id: userId,
    subject_id: subjectId,
    topic_key: r.topic_key,
    topic_label: r.topic_label,
    priority_score: r.score,
    incidence_weight: 0,
    edital_weight: 0,
    gap_score: r.gap_score ?? 0,
    retention_penalty: r.retention_penalty ?? 1,
    reason: r.reason ?? "Fraqueza no cérebro (pré-edital)",
    source: "sql",
    computed_at: new Date().toISOString(),
    recent_boost: recentBoostKeys.has(r.topic_key),
    priority_source: "brain" as const,
  }))
}
