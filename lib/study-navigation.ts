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

export function defaultPendingTarget(
  pendingQueue: StudyQueueItem[],
  activeQuestionId: string | null,
  fullQueue: StudyQueueItem[]
): StudyQueueItem | null {
  if (activeQuestionId) {
    const active = fullQueue.find((q) => q.question_id === activeQuestionId)
    if (active) return active
  }
  return pendingQueue[0] ?? null
}
