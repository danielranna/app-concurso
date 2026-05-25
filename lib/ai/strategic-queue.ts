import { supabaseServer } from "../supabase-server"
import { computeLearningSignals } from "../learning-signals"
import { loadSubjectBrain } from "./context-builder"
import { getTopicStatsForSubject } from "../learning-signals"
import { buildIncidencePayloadForExam } from "../coach-documents"
import { fetchIncidenceRows, resolveSubjectLabels } from "../incidence-rows-db"
import { normLabel } from "../incidence-subject-map"
import { fetchEditalSubjectRank } from "../edital-subject-rank-db"
import {
  buildIncidenceTopicIndex,
  computeTopicPriorityScore,
  formatPriorityReason,
  getActiveExamTargetId,
  getEditalWeightForSubject,
  matchTopicToIncidence,
  percentToIncidenceWeight,
} from "../strategic-weights"
import { topicBrainKey } from "./brain-helpers"
import { runStrategyNarrativeAgent } from "./agents/strategy"
import {
  applyLearningSignalsToScore,
  computeSubjectPriorityAggregate,
  findBrainEntryForTopic,
  formatHumanPriorityReason,
  mergeReasonWithLlm,
  resolveLlmWhyForRow,
  shouldUseStrategyLlm,
  type StrategicQueueRow,
} from "./strategy-helpers"

export type RecomputeQueueResult = {
  rows: StrategicQueueRow[]
  subject_priority: number
  llm_used: boolean
  narrative?: string
  recent_boost_count: number
  top_topic?: string
  top_topic_label?: string
}

export async function recomputeStrategicQueue(
  userId: string,
  subjectId: string,
  options?: {
    withLlmNarrative?: boolean
    recentWrongTopics?: string[]
    autoLlm?: boolean
  }
): Promise<RecomputeQueueResult> {
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

  const topicKeys = new Map<
    string,
    { displayLabel: string; wrong: number; correct: number; fromIncidence: boolean }
  >()

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

  const rows: StrategicQueueRow[] = []
  let recentBoostCount = 0

  for (const [topicNorm, t] of topicKeys) {
    const topicLabel = t.displayLabel
    const dominio =
      t.correct + t.wrong > 0 ? t.correct / (t.correct + t.wrong) : 0.5
    const brainEntry = findBrainEntryForTopic(brain, topicLabel, topicNorm)
    const gap_score = brainEntry ? 1 - brainEntry.dominio : 1 - dominio
    const estabilidade = brainEntry?.estabilidade ?? 0.5
    const retention_penalty =
      estabilidade < 0.4 ? 1.4 : estabilidade < 0.6 ? 1.15 : 1

    const match = matchTopicToIncidence(topicLabel, topicIndex)
    let incidence_weight =
      match.weight > 1 || match.matchedTopic
        ? match.weight
        : incidenceByExactKey.get(topicLabel) ??
          incidenceByExactKey.get(
            [...incidenceByExactKey.keys()].find(
              (k) => normLabel(k) === topicNorm
            ) ?? ""
          ) ??
          1

    let priority_score = computeTopicPriorityScore({
      editalWeight,
      incidenceWeight: incidence_weight,
      gapScore: gap_score,
      retentionPenalty: retention_penalty,
      wrongCount: t.wrong,
    })

    priority_score = applyLearningSignalsToScore(
      priority_score,
      topicNorm,
      learningSignals
    )

    const recentBoost = recentWrong.has(topicNorm)
    if (recentBoost) {
      priority_score = Math.round(priority_score * 1.2 * 1000) / 1000
      recentBoostCount++
    }

    if (priority_score < 0.15 && dominio > 0.85) continue

    const sqlReason = formatPriorityReason({
      editalWeight,
      incidenceWeight: incidence_weight,
      gapScore: gap_score,
      retentionPenalty: retention_penalty,
      wrongCount: t.wrong,
    })

    const humanReason = formatHumanPriorityReason({
      editalWeight,
      incidenceWeight: incidence_weight,
      gapScore: gap_score,
      retentionPenalty: retention_penalty,
      wrongCount: t.wrong,
      recentBoost,
      topicLabel,
    })

    rows.push({
      user_id: userId,
      subject_id: subjectId,
      topic_key: topicNorm,
      topic_label: topicLabel,
      priority_score,
      incidence_weight,
      edital_weight: editalWeight,
      gap_score: Math.round(gap_score * 100) / 100,
      retention_penalty,
      reason: mergeReasonWithLlm(sqlReason, humanReason),
      source: "sql",
      computed_at: new Date().toISOString(),
      recent_boost: recentBoost,
    })
  }

  rows.sort((a, b) => b.priority_score - a.priority_score)
  const subject_priority = computeSubjectPriorityAggregate(rows)

  await supabaseServer
    .from("strategic_queue_items")
    .delete()
    .eq("user_id", userId)
    .eq("subject_id", subjectId)

  const toInsert = rows.slice(0, 40).map((r) => ({
    ...r,
    subject_priority,
  }))

  if (toInsert.length) {
    const { error } = await supabaseServer
      .from("strategic_queue_items")
      .insert(toInsert)
    if (error) {
      const fallback = toInsert.map(
        ({
          topic_label: _tl,
          subject_priority: _sp,
          recent_boost: _rb,
          edital_weight: _e,
          ...rest
        }) => rest
      )
      const retry = await supabaseServer
        .from("strategic_queue_items")
        .insert(fallback)
      if (retry.error) throw new Error(retry.error.message)
    }
  }

  let llm_used = false
  let narrative: string | undefined

  const wantLlm =
    options?.withLlmNarrative === true ||
    (options?.autoLlm !== false && options?.withLlmNarrative !== false && (await shouldUseStrategyLlm(userId)))

  if (wantLlm && rows.length) {
    const narrativeResult = await runStrategyNarrativeAgent({
      userId,
      subjectId,
      queue: rows.slice(0, 10).map((r) => ({
        topic_key: r.topic_key,
        topic_label: r.topic_label,
        priority_score: r.priority_score,
        reason: r.reason,
      })),
    })
    narrative = narrativeResult.narrative || undefined
    llm_used = Object.keys(narrativeResult.whys).length > 0 || Boolean(narrative)

    for (const row of rows.slice(0, 10)) {
      const llmWhy = resolveLlmWhyForRow(
        narrativeResult.whys,
        row.topic_key,
        row.topic_label
      )
      if (!llmWhy) continue
      const merged = mergeReasonWithLlm(row.reason, row.reason, llmWhy)
      await supabaseServer
        .from("strategic_queue_items")
        .update({ reason: merged, source: "llm" })
        .eq("user_id", userId)
        .eq("subject_id", subjectId)
        .eq("topic_key", row.topic_key)
      row.reason = merged
      row.source = "llm"
    }
  }

  const top = rows[0]
  return {
    rows,
    subject_priority,
    llm_used,
    narrative,
    recent_boost_count: recentBoostCount,
    top_topic: top?.topic_key,
    top_topic_label: top?.topic_label,
  }
}

export async function recomputeAllSubjectsQueue(
  userId: string,
  options?: {
    withLlmNarrative?: boolean
    excludeSubjectId?: string
    autoLlm?: boolean
  }
) {
  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id")
    .eq("user_id", userId)

  const results: RecomputeQueueResult[] = []
  for (const s of subjects ?? []) {
    if (options?.excludeSubjectId && s.id === options.excludeSubjectId) continue
    const result = await recomputeStrategicQueue(userId, s.id, {
      withLlmNarrative: options?.withLlmNarrative,
      autoLlm: options?.autoLlm ?? false,
    })
    results.push(result)
  }
  return results
}

export async function syncEditalWeightsToQueue(
  userId: string,
  examTargetId: string
) {
  const { data: exam } = await supabaseServer
    .from("exam_targets")
    .select("id")
    .eq("user_id", userId)
    .eq("id", examTargetId)
    .single()

  if (!exam) return

  let rankRows: Awaited<ReturnType<typeof fetchEditalSubjectRank>> = []
  try {
    rankRows = await fetchEditalSubjectRank(userId, examTargetId)
  } catch {
    return
  }

  const subjectIds = new Set<string>()
  for (const row of rankRows) {
    for (const subjectId of row.subject_ids) {
      if (subjectId) subjectIds.add(subjectId)
    }
  }
  for (const subjectId of subjectIds) {
    await recomputeStrategicQueue(userId, subjectId, { autoLlm: false })
  }
}
