import assert from "node:assert/strict"
import { bumpQuestionStats, reconcileQuestionStats, type LiveAttempt } from "./widget-question-live"
import type { WidgetSummary } from "./widget-types"

const stats: WidgetSummary["stats"] = {
  summary: {
    total_attempts: 10,
    correct: 6,
    wrong: 4,
    correct_pct: 60,
    subject_count: 2,
  },
  by_subject: [],
  study_ms: 60_000,
  study_hours_label: "1 min",
}

function attempt(partial: Partial<LiveAttempt> & Pick<LiveAttempt, "id" | "isCorrect">): LiveAttempt {
  return {
    durationMs: 1000,
    createdAt: "2026-10-29T12:00:00.000Z",
    receivedAt: 1,
    ...partial,
  }
}

const bumped = bumpQuestionStats(stats, attempt({ id: "a", isCorrect: true, durationMs: 30_000 }))
assert.equal(bumped.summary.total_attempts, 11)
assert.equal(bumped.summary.correct, 7)
assert.equal(bumped.summary.wrong, 4)
assert.equal(bumped.summary.correct_pct, 63.6)
assert.equal(bumped.study_ms, 90_000)
assert.equal(bumped.summary.subject_count, 2)

const server = stats
const reconciled = reconcileQuestionStats(server, [
  attempt({ id: "late", isCorrect: false, durationMs: 0 }),
])
assert.equal(reconciled.summary.total_attempts, 11)
assert.equal(reconciled.summary.wrong, 5)
assert.equal(reconciled.summary.correct, 6)

console.log("widget-question-live ok")
