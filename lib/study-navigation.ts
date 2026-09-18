import type { StudyQueueItem } from "./question-types"

export type NavMode = "next" | "prev" | "random" | "unsolved"

export function pickNavigationTarget(
  fullQueue: StudyQueueItem[],
  pendingQueue: StudyQueueItem[],
  currentQuestionId: string | null,
  mode: NavMode
): StudyQueueItem | null {
  if (fullQueue.length === 0) return null

  if (mode === "unsolved") {
    return pendingQueue[0] ?? null
  }

  if (mode === "random") {
    const pool = pendingQueue.length > 0 ? pendingQueue : fullQueue
    return pool[Math.floor(Math.random() * pool.length)] ?? null
  }

  const idx = currentQuestionId
    ? fullQueue.findIndex((q) => q.question_id === currentQuestionId)
    : -1

  if (mode === "next") {
    if (idx < 0) return fullQueue[0]
    return fullQueue[Math.min(idx + 1, fullQueue.length - 1)] ?? null
  }

  if (mode === "prev") {
    if (idx < 0) return fullQueue[fullQueue.length - 1]
    return fullQueue[Math.max(idx - 1, 0)] ?? null
  }

  return pendingQueue[0] ?? null
}

export function pickTargetQuestionId(
  queueIds: string[],
  currentQuestionId: string | null,
  answeredIds: ReadonlySet<string>,
  mode: NavMode
): string | null {
  if (queueIds.length === 0) return null
  const pending = queueIds.filter((id) => !answeredIds.has(id))

  if (mode === "unsolved") {
    if (!currentQuestionId) return pending[0] ?? null
    const idx = queueIds.indexOf(currentQuestionId)
    const start = idx >= 0 ? idx : -1
    for (let i = 1; i <= queueIds.length; i++) {
      const id = queueIds[(start + i) % queueIds.length]
      if (id && !answeredIds.has(id)) return id
    }
    return pending[0] ?? null
  }

  if (mode === "random") {
    const pool = pending.length > 0 ? pending : queueIds
    return pool[Math.floor(Math.random() * pool.length)] ?? null
  }

  const idx = currentQuestionId ? queueIds.indexOf(currentQuestionId) : -1

  if (mode === "next") {
    if (idx < 0) return queueIds[0]
    return queueIds[Math.min(idx + 1, queueIds.length - 1)] ?? null
  }

  if (mode === "prev") {
    if (idx < 0) return queueIds[queueIds.length - 1]
    return queueIds[Math.max(idx - 1, 0)] ?? null
  }

  return pending[0] ?? null
}

export function defaultPendingTarget(
  pendingQueue: StudyQueueItem[],
  activeQuestionId: string | null,
  fullQueue: StudyQueueItem[]
): StudyQueueItem | null {
  if (activeQuestionId) {
    const stillPending = pendingQueue.find((q) => q.question_id === activeQuestionId)
    if (stillPending) return stillPending
  }
  return pendingQueue[0] ?? fullQueue.find((q) => q.question_id === activeQuestionId) ?? null
}
