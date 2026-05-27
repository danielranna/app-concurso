import type { SubjectBrainState } from "../coach-types"
import { pickQuestionIdsFromPerformance } from "../notebook-from-performance"
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

export type QuestionRoundEntry = {
  round: number
  subject_id: string
  subject_name: string
  count: number
  topic?: string
  reason?: string
}

export type QuestionSetResult = {
  questionIds: string[]
  rounds: QuestionRoundEntry[]
  topicsUsed: string[]
}

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

async function pickFromSubjectTopics(
  userId: string,
  subjectId: string,
  topics: QueueRow[],
  limit: number,
  seenQ: Set<string>
): Promise<{ ids: string[]; topic?: string; reason?: string }> {
  const brain = await loadSubjectBrain(userId, subjectId)
  const ids: string[] = []

  for (const row of topics) {
    if (ids.length >= limit) break
    const topic = row.topic_label ?? row.topic_key
    if (!topic) continue
    if (isTopicConsolidatedInBrain(brain, topic, row.topic_key)) continue

    const picked = await pickWrongNonConsolidated(
      userId,
      subjectId,
      topic,
      limit - ids.length,
      brain
    )
    for (const qid of picked) {
      if (seenQ.has(qid)) continue
      seenQ.add(qid)
      ids.push(qid)
      if (ids.length >= limit) {
        return { ids, topic, reason: row.reason ?? undefined }
      }
    }
  }

  if (!ids.length && topics.length) {
    const brain2 = brain ?? (await loadSubjectBrain(userId, subjectId))
    const topic = topics[0]!.topic_label ?? topics[0]!.topic_key
    const extra = await pickWrongNonConsolidated(
      userId,
      subjectId,
      topic,
      limit,
      brain2
    )
    for (const qid of extra) {
      if (seenQ.has(qid)) continue
      seenQ.add(qid)
      ids.push(qid)
    }
    if (ids.length) {
      return { ids, topic, reason: topics[0]!.reason ?? undefined }
    }
  }

  return { ids, topic: topics[0]?.topic_label, reason: topics[0]?.reason ?? undefined }
}

export async function buildRoundRobinQuestionSet(params: {
  userId: string
  orderedSubjectIds: string[]
  queueBySubject: Map<string, QueueRow[]>
  subjectNames: Map<string, string>
  budget: number
  perSubjectRound: number
  distributionMode: QuestionDistributionMode
}): Promise<QuestionSetResult> {
  const {
    userId,
    orderedSubjectIds,
    queueBySubject,
    subjectNames,
    budget,
    perSubjectRound,
    distributionMode,
  } = params

  const seenQ = new Set<string>()
  const questionIds: string[] = []
  const rounds: QuestionRoundEntry[] = []
  const topicsUsed: string[] = []
  let remaining = budget
  let roundNum = 0

  if (!orderedSubjectIds.length || remaining <= 0) {
    return { questionIds, rounds, topicsUsed }
  }

  const chunkForSubject =
    distributionMode === "equal_split"
      ? Math.max(1, Math.floor(budget / orderedSubjectIds.length))
      : perSubjectRound

  while (remaining > 0) {
    roundNum++
    let addedThisRound = 0

    for (const subjectId of orderedSubjectIds) {
      if (remaining <= 0) break
      const take = Math.min(chunkForSubject, remaining)
      if (take <= 0) continue

      const topics = queueBySubject.get(subjectId) ?? []
      const { ids, topic, reason } = await pickFromSubjectTopics(
        userId,
        subjectId,
        topics,
        take,
        seenQ
      )

      if (!ids.length) continue

      for (const qid of ids) questionIds.push(qid)
      remaining -= ids.length
      addedThisRound += ids.length

      if (topic && !topicsUsed.includes(topic)) topicsUsed.push(topic)

      rounds.push({
        round: roundNum,
        subject_id: subjectId,
        subject_name: subjectNames.get(subjectId) ?? subjectId,
        count: ids.length,
        topic,
        reason,
      })
    }

    if (addedThisRound === 0) break
  }

  return { questionIds, rounds, topicsUsed }
}

export async function buildTopNQuestionSet(params: {
  userId: string
  queue: QueueRow[]
  subjectNames: Map<string, string>
  budget: number
}): Promise<QuestionSetResult> {
  const { userId, queue, subjectNames, budget } = params
  const seenQ = new Set<string>()
  const questionIds: string[] = []
  const rounds: QuestionRoundEntry[] = []
  const topicsUsed: string[] = []
  let remaining = budget

  const sorted = [...queue].sort(
    (a, b) => Number(b.priority_score) - Number(a.priority_score)
  )

  const bySubject = new Map<string, QueueRow[]>()
  for (const row of sorted) {
    const list = bySubject.get(row.subject_id) ?? []
    list.push(row)
    bySubject.set(row.subject_id, list)
  }

  for (const row of sorted) {
    if (remaining <= 0) break
    const topic = row.topic_label ?? row.topic_key
    if (!topic) continue
    if (topicsUsed.includes(topic)) continue

    const brain = await loadSubjectBrain(userId, row.subject_id)
    if (isTopicConsolidatedInBrain(brain, topic, row.topic_key)) continue

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

    if (!ids.length) continue

    for (const qid of ids) questionIds.push(qid)
    remaining -= ids.length
    topicsUsed.push(topic)

    rounds.push({
      round: rounds.length + 1,
      subject_id: row.subject_id,
      subject_name: subjectNames.get(row.subject_id) ?? row.subject_id,
      count: ids.length,
      topic,
      reason: row.reason ?? undefined,
    })
  }

  return { questionIds, rounds, topicsUsed }
}
