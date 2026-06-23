import { supabaseServer } from "../supabase-server"
import { fetchEditalSubjectRank } from "../edital-subject-rank-db"
import { topicBrainKey } from "./brain-helpers"
import { runStrategyNarrativeAgent } from "./agents/strategy"
import type { PrioritySource } from "../priority-source"
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
import type { PriorityBreakdownRow } from "./priority-breakdown"

export type RecomputeQueueResult = {
  rows: StrategicQueueRow[]
  subject_priority: number
  llm_used: boolean
  narrative?: string
  recent_boost_count: number
  top_topic?: string
  top_topic_label?: string
}

export type LoadStrategicQueueResult = {
  items: Record<string, unknown>[]
  priority_source: PrioritySource
  hydrated_from?: "database" | "recompute" | "breakdown"
}

function breakdownRowsToQueueItems(
  rows: PriorityBreakdownRow[],
  userId: string,
  subjectId: string,
  prioritySource: PrioritySource
): Record<string, unknown>[] {
  return rows.map((r) => ({
    user_id: userId,
    subject_id: subjectId,
    topic_key: r.topic_key,
    topic_label: r.topic_label,
    priority_score: r.score,
    incidence_weight: r.incidence_weight,
    edital_weight: r.edital_weight,
    gap_score: r.gap_score ?? 0,
    retention_penalty: r.retention_penalty ?? 1,
    reason: r.reason ?? null,
    source: "sql",
    priority_source: prioritySource,
    dominio: r.dominio,
    wrong_count: r.wrong_count,
    brain_status: r.brain_status,
    attempts: r.attempts,
  }))
}

async function fetchPersistedQueueItems(
  userId: string,
  subjectId: string,
  prioritySource: PrioritySource
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabaseServer
    .from("strategic_queue_items")
    .select("*")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("priority_source", prioritySource)
    .order("priority_score", { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function loadStrategicQueueForSubject(
  userId: string,
  subjectId: string,
  options?: { autoRecompute?: boolean }
): Promise<LoadStrategicQueueResult> {
  const prefs = await getExecutorStudyPreferences(userId)
  const prioritySource = resolvePrioritySource(prefs.study_mode)

  let items = await fetchPersistedQueueItems(userId, subjectId, prioritySource)
  let hydrated_from: LoadStrategicQueueResult["hydrated_from"] = items.length
    ? "database"
    : undefined

  if (!items.length && options?.autoRecompute) {
    await recomputeStrategicQueue(userId, subjectId, {
      withLlmNarrative: false,
      autoLlm: false,
    })
    items = await fetchPersistedQueueItems(userId, subjectId, prioritySource)
    if (items.length) hydrated_from = "recompute"
  }

  if (!items.length) {
    const breakdown = await computePriorityBreakdown(userId, subjectId)
    const rows =
      prioritySource === "brain"
        ? breakdown.brain_performance
        : breakdown.crossed
    if (rows.length) {
      items = breakdownRowsToQueueItems(
        rows,
        userId,
        subjectId,
        prioritySource
      )
      hydrated_from = "breakdown"
    }
  }

  return { items, priority_source: prioritySource, hydrated_from }
}

/** Colunas opcionais exigem sql-study-cycle.sql aplicado no Supabase. */
async function insertStrategicQueueRows(
  toInsert: Record<string, unknown>[]
): Promise<void> {
  if (!toInsert.length) return

  const { error } = await supabaseServer
    .from("strategic_queue_items")
    .insert(toInsert)

  if (!error) return

  const optionalColumns = new Set([
    "topic_label",
    "subject_priority",
    "recent_boost",
    "edital_weight",
  ])
  const fallback = toInsert.map((item) => {
    const copy = { ...item } as Record<string, unknown>
    for (const col of optionalColumns) {
      delete copy[col]
    }
    return copy
  })

  const retry = await supabaseServer
    .from("strategic_queue_items")
    .insert(fallback)

  if (retry.error) {
    throw new Error(
      `Falha ao salvar fila estratégica. Confira se sql-study-cycle.sql foi aplicado: ${retry.error.message}`
    )
  }
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
    await insertStrategicQueueRows(toInsert)
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
