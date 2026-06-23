import type {
  PlanGenerationStep,
  SubjectBrainState,
  SubjectPickDiagnostic,
  TopicPickTried,
} from "../coach-types"
import { pickQuestionIdsFromPerformance } from "../notebook-from-performance"
import { supabaseServer } from "../supabase-server"
import { topicBrainKey, findTopicEntry } from "./brain-helpers"
import { loadSubjectBrain } from "./context-builder"
import type { QuestionDistributionMode } from "./execution-subjects"

export type QueueRow = {
  subject_id: string
  topic_key: string
  topic_label?: string
  priority_score: number
  reason?: string | null
}

export type PickSource = "queue_topic" | "subject_fallback" | "none"

export type QuestionRoundEntry = {
  round: number
  subject_id: string
  subject_name: string
  count: number
  topic?: string
  reason?: string
  source?: PickSource
}

export type QuestionSetResult = {
  questionIds: string[]
  rounds: QuestionRoundEntry[]
  topicsUsed: string[]
  subject_pick_diagnostics: SubjectPickDiagnostic[]
}

export type PickProgressCallback = (step: PlanGenerationStep) => void

const CONSOLIDATED_STATUSES = new Set(["dominado", "forte"])

export function isTopicConsolidatedInBrain(
  brain: SubjectBrainState | null,
  topicDisplay: string,
  topicNorm?: string
): boolean {
  if (!brain?.topic_map) return false
  const key = topicNorm ?? topicBrainKey(topicDisplay)
  const found = findTopicEntry(brain.topic_map, topicDisplay)
  const entry = found?.[1] ?? brain.topic_map[key]
  if (!entry) return false
  if (CONSOLIDATED_STATUSES.has(entry.status) && entry.dominio >= 0.85) {
    return true
  }
  return entry.dominio >= 0.85 && entry.status !== "critico" && entry.status !== "fraco"
}

export async function pickWrongNonConsolidated(
  userId: string,
  subjectId: string,
  topic: string,
  limit: number,
  brain: SubjectBrainState | null
): Promise<string[]> {
  const topicNorm = topicBrainKey(topic)
  if (isTopicConsolidatedInBrain(brain, topic, topicNorm)) return []

  return pickQuestionIdsFromPerformance(userId, {
    subject_id: subjectId,
    wrong_only: true,
    min_wrong_attempts: 1,
    tec_topics: [topic],
    limit,
  })
}

async function pickSubjectWrongFallback(
  userId: string,
  subjectId: string,
  limit: number,
  seenQ: Set<string>,
  brain: SubjectBrainState | null
): Promise<string[]> {
  const raw = await pickQuestionIdsFromPerformance(userId, {
    subject_id: subjectId,
    wrong_only: true,
    min_wrong_attempts: 1,
    limit: Math.min(limit * 4, 200),
  })

  if (!raw.length) return []

  const { data: questions } = await supabaseServer
    .from("questions")
    .select("id, tec_topic")
    .in("id", raw.slice(0, 200))

  const topicById = new Map(
    (questions ?? []).map((q) => [q.id as string, String(q.tec_topic ?? "")])
  )

  const ids: string[] = []
  for (const qid of raw) {
    if (seenQ.has(qid)) continue
    const topic = topicById.get(qid) ?? ""
    if (topic && isTopicConsolidatedInBrain(brain, topic)) continue
    seenQ.add(qid)
    ids.push(qid)
    if (ids.length >= limit) break
  }

  return ids
}

function inferSkipReason(
  topics: QueueRow[],
  picked: number,
  hadQueue: boolean,
  topicsTried: TopicPickTried[]
): SubjectPickDiagnostic["skip_reason"] | undefined {
  if (picked > 0) return undefined
  if (!hadQueue) return "no_queue"
  if (!topics.length) return "no_queue"
  if (
    topicsTried.length > 0 &&
    topicsTried.every((t) => t.skip_reason === "consolidated")
  ) {
    return "all_consolidated"
  }
  return "no_wrongs"
}

async function pickFromSubjectTopics(
  userId: string,
  subjectId: string,
  topics: QueueRow[],
  limit: number,
  seenQ: Set<string>,
  options?: {
    subjectName?: string
    onProgress?: PickProgressCallback
  }
): Promise<{
  ids: string[]
  topic?: string
  reason?: string
  source: PickSource
  topics_tried: TopicPickTried[]
}> {
  const brain = await loadSubjectBrain(userId, subjectId)
  const ids: string[] = []
  const topics_tried: TopicPickTried[] = []
  let usedTopic: string | undefined
  let usedReason: string | undefined
  const subjectName = options?.subjectName ?? subjectId

  const emitTopic = (topic: string, picked: number, skip_reason?: TopicPickTried["skip_reason"]) => {
    topics_tried.push({ topic, picked, skip_reason })
    options?.onProgress?.({
      phase: "topic_tried",
      message:
        picked > 0
          ? `${topic}: ${picked} questão(ões)`
          : `${topic}: 0 elegíveis${skip_reason === "consolidated" ? " (consolidado)" : ""}`,
      detail: { subject_id: subjectId, subject_name: subjectName, topic, picked, skip_reason },
    })
  }

  for (const row of topics) {
    if (ids.length >= limit) break
    const topic = row.topic_label ?? row.topic_key
    if (!topic) continue

    if (isTopicConsolidatedInBrain(brain, topic, row.topic_key)) {
      emitTopic(topic, 0, "consolidated")
      continue
    }

    const picked = await pickWrongNonConsolidated(
      userId,
      subjectId,
      topic,
      limit - ids.length,
      brain
    )

    let addedFromTopic = 0
    for (const qid of picked) {
      if (seenQ.has(qid)) continue
      seenQ.add(qid)
      ids.push(qid)
      addedFromTopic++
      usedTopic = topic
      usedReason = row.reason ?? undefined
      if (ids.length >= limit) break
    }

    emitTopic(topic, addedFromTopic, addedFromTopic === 0 ? "no_wrongs" : undefined)

    if (ids.length >= limit) {
      return { ids, topic: usedTopic, reason: usedReason, source: "queue_topic", topics_tried }
    }
  }

  if (!ids.length) {
    const fallback = await pickSubjectWrongFallback(
      userId,
      subjectId,
      limit,
      seenQ,
      brain
    )
    if (fallback.length) {
      options?.onProgress?.({
        phase: "topic_tried",
        message: `Histórico da matéria: ${fallback.length} questão(ões)`,
        detail: { subject_id: subjectId, subject_name: subjectName, source: "subject_fallback" },
      })
      return {
        ids: fallback,
        topic: usedTopic ?? topics[0]?.topic_label,
        reason: usedReason ?? "Histórico de erros da matéria",
        source: "subject_fallback",
        topics_tried,
      }
    }
  }

  return {
    ids,
    topic: usedTopic ?? topics[0]?.topic_label,
    reason: usedReason,
    source: ids.length ? "queue_topic" : "none",
    topics_tried,
  }
}

export async function buildRoundRobinQuestionSet(params: {
  userId: string
  orderedSubjectIds: string[]
  queueBySubject: Map<string, QueueRow[]>
  subjectNames: Map<string, string>
  budget: number
  perSubjectRound: number
  distributionMode: QuestionDistributionMode
  onProgress?: PickProgressCallback
}): Promise<QuestionSetResult> {
  const {
    userId,
    orderedSubjectIds,
    queueBySubject,
    subjectNames,
    budget,
    perSubjectRound,
    distributionMode,
    onProgress,
  } = params

  const seenQ = new Set<string>()
  const questionIds: string[] = []
  const rounds: QuestionRoundEntry[] = []
  const topicsUsed: string[] = []
  const subject_pick_diagnostics: SubjectPickDiagnostic[] = []
  let remaining = budget
  let roundNum = 0

  if (!orderedSubjectIds.length || remaining <= 0) {
    return { questionIds, rounds, topicsUsed, subject_pick_diagnostics }
  }

  const chunkForSubject =
    distributionMode === "equal_split"
      ? Math.max(1, Math.floor(budget / orderedSubjectIds.length))
      : perSubjectRound

  const subjectsWithNoPicks = new Set<string>()

  while (remaining > 0) {
    roundNum++
    let addedThisRound = 0

    for (const subjectId of orderedSubjectIds) {
      if (remaining <= 0) break
      if (subjectsWithNoPicks.has(subjectId)) continue

      const take = Math.min(chunkForSubject, remaining)
      if (take <= 0) continue

      const topics = queueBySubject.get(subjectId) ?? []
      const subjectName = subjectNames.get(subjectId) ?? subjectId

      onProgress?.({
        phase: "picking_subject",
        message: `Buscando erradas em ${subjectName}…`,
        detail: { subject_id: subjectId, subject_name: subjectName, round: roundNum },
      })

      const { ids, topic, reason, source, topics_tried } = await pickFromSubjectTopics(
        userId,
        subjectId,
        topics,
        take,
        seenQ,
        { subjectName, onProgress }
      )

      subject_pick_diagnostics.push({
        subject_id: subjectId,
        subject_name: subjectName,
        requested: take,
        picked: ids.length,
        source,
        skip_reason: inferSkipReason(topics, ids.length, topics.length > 0, topics_tried),
        round: roundNum,
        topics_tried,
      })

      if (!ids.length) {
        subjectsWithNoPicks.add(subjectId)
        continue
      }

      for (const qid of ids) questionIds.push(qid)
      remaining -= ids.length
      addedThisRound += ids.length

      if (topic && !topicsUsed.includes(topic)) topicsUsed.push(topic)

      rounds.push({
        round: roundNum,
        subject_id: subjectId,
        subject_name: subjectName,
        count: ids.length,
        topic,
        reason,
        source,
      })
    }

    if (addedThisRound === 0) break
  }

  return { questionIds, rounds, topicsUsed, subject_pick_diagnostics }
}

export async function buildTopNQuestionSet(params: {
  userId: string
  queue: QueueRow[]
  subjectNames: Map<string, string>
  budget: number
  allowlist?: string[]
  onProgress?: PickProgressCallback
}): Promise<QuestionSetResult> {
  const { userId, queue, subjectNames, budget, allowlist, onProgress } = params
  const seenQ = new Set<string>()
  const questionIds: string[] = []
  const rounds: QuestionRoundEntry[] = []
  const topicsUsed: string[] = []
  const subject_pick_diagnostics: SubjectPickDiagnostic[] = []
  const diagnosticsBySubject = new Map<string, SubjectPickDiagnostic>()
  const pickedBySubject = new Map<string, number>()
  let remaining = budget

  const sorted = [...queue].sort(
    (a, b) => Number(b.priority_score) - Number(a.priority_score)
  )

  const recordTopicForSubject = (
    subjectId: string,
    topicTried: TopicPickTried
  ) => {
    const existing = diagnosticsBySubject.get(subjectId)
    if (existing) {
      existing.topics_tried = [...(existing.topics_tried ?? []), topicTried]
    } else {
      diagnosticsBySubject.set(subjectId, {
        subject_id: subjectId,
        subject_name: subjectNames.get(subjectId) ?? subjectId,
        requested: 0,
        picked: 0,
        source: "none",
        topics_tried: [topicTried],
      })
    }
  }

  for (const row of sorted) {
    if (remaining <= 0) break
    const topic = row.topic_label ?? row.topic_key
    if (!topic) continue
    if (topicsUsed.includes(topic)) continue

    const subjectName = subjectNames.get(row.subject_id) ?? row.subject_id
    onProgress?.({
      phase: "picking_subject",
      message: `Buscando erradas em ${subjectName}…`,
      detail: { subject_id: row.subject_id, subject_name: subjectName },
    })

    const brain = await loadSubjectBrain(userId, row.subject_id)
    if (isTopicConsolidatedInBrain(brain, topic, row.topic_key)) {
      recordTopicForSubject(row.subject_id, { topic, picked: 0, skip_reason: "consolidated" })
      onProgress?.({
        phase: "topic_tried",
        message: `${topic}: 0 elegíveis (consolidado)`,
        detail: { subject_id: row.subject_id, subject_name: subjectName, topic },
      })
      continue
    }

    const picked = await pickWrongNonConsolidated(
      userId,
      row.subject_id,
      topic,
      remaining,
      brain
    )

    const ids: string[] = []
    for (const qid of picked) {
      if (seenQ.has(qid)) continue
      seenQ.add(qid)
      ids.push(qid)
      if (ids.length >= remaining) break
    }

    recordTopicForSubject(row.subject_id, {
      topic,
      picked: ids.length,
      skip_reason: ids.length === 0 ? "no_wrongs" : undefined,
    })
    onProgress?.({
      phase: "topic_tried",
      message:
        ids.length > 0
          ? `${topic}: ${ids.length} questão(ões)`
          : `${topic}: 0 elegíveis`,
      detail: { subject_id: row.subject_id, subject_name: subjectName, topic, picked: ids.length },
    })

    if (!ids.length) continue

    for (const qid of ids) questionIds.push(qid)
    remaining -= ids.length
    topicsUsed.push(topic)
    pickedBySubject.set(
      row.subject_id,
      (pickedBySubject.get(row.subject_id) ?? 0) + ids.length
    )

    const diag = diagnosticsBySubject.get(row.subject_id)
    if (diag) {
      diag.picked += ids.length
      diag.requested = Math.max(diag.requested, ids.length)
      diag.source = "queue_topic"
      diag.skip_reason = undefined
    }

    rounds.push({
      round: rounds.length + 1,
      subject_id: row.subject_id,
      subject_name: subjectName,
      count: ids.length,
      topic,
      reason: row.reason ?? undefined,
      source: "queue_topic",
    })
  }

  const subjectsToTry = allowlist?.length
    ? allowlist
    : [...new Set(sorted.map((r) => r.subject_id))]

  for (const subjectId of subjectsToTry) {
    if (remaining <= 0) break
    const already = pickedBySubject.get(subjectId) ?? 0
    if (already > 0) continue

    const subjectName = subjectNames.get(subjectId) ?? subjectId
    const subjectTopics = queueBySubjectFromRows(sorted, subjectId)

    onProgress?.({
      phase: "picking_subject",
      message: `Buscando erradas em ${subjectName}…`,
      detail: { subject_id: subjectId, subject_name: subjectName },
    })

    const { ids, topic, reason, source, topics_tried } = await pickFromSubjectTopics(
      userId,
      subjectId,
      subjectTopics,
      remaining,
      seenQ,
      { subjectName, onProgress }
    )

    if (!ids.length) {
      subject_pick_diagnostics.push({
        subject_id: subjectId,
        subject_name: subjectName,
        requested: remaining,
        picked: 0,
        source: "none",
        skip_reason: inferSkipReason(
          subjectTopics,
          0,
          sorted.some((r) => r.subject_id === subjectId),
          topics_tried
        ),
        topics_tried,
      })
      continue
    }

    for (const qid of ids) questionIds.push(qid)
    remaining -= ids.length
    if (topic && !topicsUsed.includes(topic)) topicsUsed.push(topic)

    subject_pick_diagnostics.push({
      subject_id: subjectId,
      subject_name: subjectName,
      requested: ids.length,
      picked: ids.length,
      source,
      topics_tried,
    })

    rounds.push({
      round: rounds.length + 1,
      subject_id: subjectId,
      subject_name: subjectName,
      count: ids.length,
      topic,
      reason,
      source,
    })
  }

  for (const [subjectId, diag] of diagnosticsBySubject) {
    if (subject_pick_diagnostics.some((d) => d.subject_id === subjectId)) continue
    const picked = pickedBySubject.get(subjectId) ?? diag.picked
    const subjectTopics = queueBySubjectFromRows(sorted, subjectId)
    subject_pick_diagnostics.push({
      ...diag,
      requested: picked || diag.requested,
      picked,
      source: picked > 0 ? "queue_topic" : diag.source,
      skip_reason:
        picked > 0
          ? undefined
          : inferSkipReason(
              subjectTopics,
              0,
              sorted.some((r) => r.subject_id === subjectId),
              diag.topics_tried ?? []
            ),
    })
  }

  for (const [subjectId, count] of pickedBySubject) {
    if (subject_pick_diagnostics.some((d) => d.subject_id === subjectId)) continue
    subject_pick_diagnostics.push({
      subject_id: subjectId,
      subject_name: subjectNames.get(subjectId) ?? subjectId,
      requested: count,
      picked: count,
      source: "queue_topic",
    })
  }

  return { questionIds, rounds, topicsUsed, subject_pick_diagnostics }
}

function queueBySubjectFromRows(
  rows: QueueRow[],
  subjectId: string
): QueueRow[] {
  return rows.filter((r) => r.subject_id === subjectId)
}
