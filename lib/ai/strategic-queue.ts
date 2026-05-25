import { supabaseServer } from "../supabase-server"
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
import { runStrategyNarrativeAgent } from "./agents/strategy"

export async function recomputeStrategicQueue(
  userId: string,
  subjectId: string,
  options?: { withLlmNarrative?: boolean; recentWrongTopics?: string[] }
) {
  const { data: subject } = await supabaseServer
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .single()

  const topicStats = await getTopicStatsForSubject(userId, subjectId)
  const brain = await loadSubjectBrain(userId, subjectId)

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
    (options?.recentWrongTopics ?? []).map((t) => normLabel(t))
  )

  const topicKeys = new Map<
    string,
    { wrong: number; correct: number; fromIncidence: boolean }
  >()

  for (const t of topicStats) {
    topicKeys.set(t.topic, {
      wrong: t.wrong,
      correct: t.correct,
      fromIncidence: false,
    })
  }

  for (const [name] of topicIndex) {
    const existing = topicKeys.get(name)
    if (existing) {
      existing.fromIncidence = true
    } else {
      topicKeys.set(name, { wrong: 0, correct: 0, fromIncidence: true })
    }
  }

  const rows: {
    user_id: string
    subject_id: string
    topic_key: string
    priority_score: number
    incidence_weight: number
    edital_weight: number
    gap_score: number
    retention_penalty: number
    reason: string
    source: string
    computed_at: string
  }[] = []

  for (const [topic, t] of topicKeys) {
    const dominio = t.correct + t.wrong > 0 ? t.correct / (t.correct + t.wrong) : 0.5
    const brainEntry =
      brain?.topic_map?.[topic] ??
      Object.entries(brain?.topic_map ?? {}).find(
        ([k]) => normLabel(k) === normLabel(topic)
      )?.[1]
    const gap_score = brainEntry ? 1 - brainEntry.dominio : 1 - dominio
    const estabilidade = brainEntry?.estabilidade ?? 0.5
    const retention_penalty =
      estabilidade < 0.4 ? 1.4 : estabilidade < 0.6 ? 1.15 : 1

    const match = matchTopicToIncidence(topic, topicIndex)
    let incidence_weight =
      match.weight > 1 || match.matchedTopic
        ? match.weight
        : incidenceByExactKey.get(topic) ?? 1

    let priority_score = computeTopicPriorityScore({
      editalWeight,
      incidenceWeight: incidence_weight,
      gapScore: gap_score,
      retentionPenalty: retention_penalty,
      wrongCount: t.wrong,
    })

    if (recentWrong.has(normLabel(topic))) {
      priority_score = Math.round(priority_score * 1.2 * 1000) / 1000
    }

    if (priority_score < 0.15 && dominio > 0.85) continue

    rows.push({
      user_id: userId,
      subject_id: subjectId,
      topic_key: topic,
      priority_score,
      incidence_weight,
      edital_weight: editalWeight,
      gap_score: Math.round(gap_score * 100) / 100,
      retention_penalty,
      reason: formatPriorityReason({
        editalWeight,
        incidenceWeight: incidence_weight,
        gapScore: gap_score,
        retentionPenalty: retention_penalty,
        wrongCount: t.wrong,
      }),
      source: "sql",
      computed_at: new Date().toISOString(),
    })
  }

  rows.sort((a, b) => b.priority_score - a.priority_score)

  await supabaseServer
    .from("strategic_queue_items")
    .delete()
    .eq("user_id", userId)
    .eq("subject_id", subjectId)

  if (rows.length) {
    const { error } = await supabaseServer
      .from("strategic_queue_items")
      .insert(rows.slice(0, 40))
    if (error) {
      const withoutEdital = rows.slice(0, 40).map(
        ({ edital_weight: _e, ...rest }) => rest
      )
      const retry = await supabaseServer
        .from("strategic_queue_items")
        .insert(withoutEdital)
      if (retry.error) throw new Error(retry.error.message)
    }
  }

  if (options?.withLlmNarrative && rows.length) {
    const narrative = await runStrategyNarrativeAgent({
      userId,
      subjectId,
      queue: rows.slice(0, 10),
    })
    for (const [topic_key, why] of Object.entries(narrative.whys)) {
      await supabaseServer
        .from("strategic_queue_items")
        .update({ reason: why, source: "llm" })
        .eq("user_id", userId)
        .eq("subject_id", subjectId)
        .eq("topic_key", topic_key)
    }
  }

  return rows
}

export async function recomputeAllSubjectsQueue(userId: string) {
  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id")
    .eq("user_id", userId)

  const all = []
  for (const s of subjects ?? []) {
    const rows = await recomputeStrategicQueue(userId, s.id)
    all.push(...rows)
  }
  return all
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
    await recomputeStrategicQueue(userId, subjectId)
  }
}
