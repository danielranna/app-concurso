import assert from "node:assert/strict"
import {
  dedupeDailyWrongAttempts,
  dayBounds,
} from "./daily-wrong-attempts-utils"
import type { DailyWrongItem } from "./daily-wrong-attempts-types"

function item(
  question_id: string,
  created_at: string,
  attempt_id = question_id
): DailyWrongItem {
  return {
    attempt_id,
    question_id,
    tec_id: 1,
    tec_url: "https://www.tecconcursos.com.br/questoes/1",
    selected_answer: "A",
    correct_answer: "B",
    tec_subject: null,
    tec_topic: null,
    created_at,
    notebook_id: null,
  }
}

const rows = [
  item("q1", "2026-06-16T15:00:00Z", "a1"),
  item("q2", "2026-06-16T14:00:00Z", "a2"),
  item("q1", "2026-06-16T10:00:00Z", "a3"),
]

const deduped = dedupeDailyWrongAttempts(rows)
assert.equal(deduped.length, 2)
assert.equal(deduped[0]!.attempt_id, "a1")
assert.equal(deduped[1]!.question_id, "q2")

const { start, end } = dayBounds("2026-06-16")
assert.ok(start < end)
assert.ok(start.includes("2026-06-16") || new Date(start).getDate() === 16)

console.log("daily-wrong-attempts.test.ts: ok")
