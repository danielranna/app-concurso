import assert from "node:assert/strict"
import {
  dedupeDailyWrongAttempts,
  dayBounds,
  splitDailyWrongOptions,
  todayDateString,
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
    type: "multiple_choice",
    statement: "Enunciado",
    content_before: null,
    content_after: null,
    content_blocks: null,
    options: [
      { label: "A", text: "Marcada" },
      { label: "B", text: "Gabarito" },
      { label: "C", text: "Distrator" },
    ],
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

const { start, end } = dayBounds("2026-08-26")
assert.equal(start, "2026-08-26T03:00:00.000Z")
assert.equal(end, "2026-08-27T03:00:00.000Z")
const lateNightUtc = "2026-08-27T02:13:00.000Z"
assert.ok(start <= lateNightUtc && lateNightUtc < end)
assert.equal(todayDateString(new Date(lateNightUtc)), "2026-08-26")

const split = splitDailyWrongOptions(
  [
    { label: "A", text: "Marcada" },
    { label: "b", text: "Gabarito" },
    { label: "C", text: "Outra" },
    { label: "D", text: "Mais uma" },
  ],
  "a",
  "B"
)
assert.equal(split.marked?.text, "Marcada")
assert.equal(split.gabarito?.text, "Gabarito")
assert.equal(split.others.length, 2)
assert.equal(split.others[0]!.label, "C")
assert.equal(split.others[1]!.label, "D")

const emptySplit = splitDailyWrongOptions([], "A", "C")
assert.equal(emptySplit.marked, null)
assert.equal(emptySplit.gabarito, null)
assert.equal(emptySplit.others.length, 0)

console.log("daily-wrong-attempts.test.ts: ok")
