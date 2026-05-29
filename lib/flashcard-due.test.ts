import assert from "node:assert/strict"
import { State } from "ts-fsrs"
import { isEligibleForStudy, isDueForToday } from "./flashcard-due"
import { applyDeferToQueue } from "./flashcard-study-order"

const now = new Date(2026, 4, 29, 12, 0, 0, 0)

function learningStateData() {
  return { state: State.Learning, due: now.toISOString() }
}

function dueInMinutes(mins: number) {
  return new Date(now.getTime() + mins * 60_000)
}

assert.equal(isEligibleForStudy(dueInMinutes(-5), learningStateData(), now), true)
assert.equal(isEligibleForStudy(dueInMinutes(10), learningStateData(), now), true)
assert.equal(
  isEligibleForStudy(dueInMinutes(10), learningStateData(), now),
  isDueForToday(dueInMinutes(10), now)
)

const tomorrow = new Date(2026, 4, 30, 9, 0, 0, 0)
assert.equal(isEligibleForStudy(tomorrow, learningStateData(), now), false)

const row = (cardId: string) => ({ card_id: cardId })
const queue = [row("A"), row("B"), row("C")]

assert.deepEqual(
  applyDeferToQueue(queue, ["A"]).map((r) => r.card_id),
  ["B", "C", "A"]
)
assert.deepEqual(applyDeferToQueue(queue, []).map((r) => r.card_id), ["A", "B", "C"])
assert.deepEqual(
  applyDeferToQueue(queue, ["A", "C"]).map((r) => r.card_id),
  ["B", "A", "C"]
)

console.log("flashcard-due.test.ts: ok")
