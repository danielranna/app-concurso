import { formatStudyDuration } from "./format-study-duration"
import type { WidgetSummary } from "./widget-types"

export type LiveAttempt = {
  id: string
  isCorrect: boolean
  durationMs: number
  createdAt: string
  receivedAt: number
}

type QuestionStats = WidgetSummary["stats"]

export function widgetQuestionTopic(userId: string): string {
  return `widget-questions:${userId}`
}

export function attemptInPeriod(createdAt: string, since: string | null): boolean {
  if (!since) return true
  const created = Date.parse(createdAt)
  const start = Date.parse(since)
  if (Number.isNaN(created) || Number.isNaN(start)) return false
  return created >= start
}

export function bumpQuestionStats(stats: QuestionStats, attempt: LiveAttempt): QuestionStats {
  const correct = stats.summary.correct + (attempt.isCorrect ? 1 : 0)
  const wrong = stats.summary.wrong + (attempt.isCorrect ? 0 : 1)
  const total = stats.summary.total_attempts + 1
  const studyMs = stats.study_ms + Math.max(0, Math.round(attempt.durationMs) || 0)
  return {
    ...stats,
    summary: {
      ...stats.summary,
      correct,
      wrong,
      total_attempts: total,
      correct_pct: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
    },
    study_ms: studyMs,
    study_hours_label: formatStudyDuration(studyMs),
  }
}

/** O servidor é a conferência. Respostas que chegaram durante a busca entram de novo por cima. */
export function reconcileQuestionStats(server: QuestionStats, late: LiveAttempt[]): QuestionStats {
  return late.reduce(bumpQuestionStats, server)
}
