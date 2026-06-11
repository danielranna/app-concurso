import { supabaseServer } from "../supabase-server"
import { fetchEditalSubjectRank } from "../edital-subject-rank-db"
import { topicBrainKey } from "./brain-helpers"
import { runStrategyNarrativeAgent } from "./agents/strategy"
import { resolvePrioritySource } from "../priority-source"
import { getExecutorStudyPreferences } from "./execution-subjects"
import {
  brainRowsToStrategicQueue,
  computePriorityBreakdown,
  crossedRowsToStrategicQueue,
} from "./priority-breakdown"
import {
  computeSubjectPriorityAggregate,
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
  const recentWrong = new Set(
    (options?.recentWrongTopics ?? []).map((t) => topicBrainKey(t))
  )

  const breakdown = await computePriorityBreakdown(userId, subjectId, {
    recentWrongTopics: options?.recentWrongTopics,
  })

  const prefs = await getExecutorStudyPreferences(userId)
  const prioritySource = resolvePrioritySource(prefs.study_mode)

  const rows =
    prioritySource === "brain"
      ? brainRowsToStrategicQueue(
          userId,
          subjectId,
          breakdown.brain_performance,
          recentWrong
        )
      : crossedRowsToStrategicQueue(
          userId,
          subjectId,
          breakdown.crossed,
          recentWrong
        )

  let recentBoostCount = 0
  for (const r of rows) {
    if (r.recent_boost) recentBoostCount++
  }

  rows.sort((a, b) => b.priority_score - a.priority_score)
  const subject_priority = computeSubjectPriorityAggregate(rows)

  await supabaseServer
    .from("strategic_queue_items")
    .delete()
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("priority_source", prioritySource)

  const toInsert = rows.slice(0, 40).map((r) => ({
    ...r,
    subject_priority,
    priority_source: prioritySource,
  }))

  if (toInsert.length) {
    const { error } = await supabaseServer
      .from("strategic_queue_items")
      .insert(toInsert)
    if (error) {
      const fallback = toInsert.map((item) => {
        const copy = { ...item } as Record<string, unknown>
        delete copy.topic_label
        delete copy.subject_priority
        delete copy.recent_boost
        delete copy.edital_weight
        delete copy.priority_source
        return copy
      })
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
    (options?.autoLlm !== false &&
      options?.withLlmNarrative !== false &&
      (await shouldUseStrategyLlm(userId)))

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
    llm_used =
      Object.keys(narrativeResult.whys).length > 0 || Boolean(narrative)

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
        .eq("priority_source", prioritySource)
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
