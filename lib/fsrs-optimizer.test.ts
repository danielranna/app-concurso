import assert from "node:assert/strict"
import { FSRSBindingReview } from "@open-spaced-repetition/binding"
import { buildTrainingItems } from "./fsrs-training-items"
import { clampRetention, mergeFsrsParams } from "./fsrs-params-merge"
import { DEFAULT_REQUEST_RETENTION } from "./flashcard-types"

const defaults = mergeFsrsParams()
assert.equal(defaults.request_retention, DEFAULT_REQUEST_RETENTION)
assert.deepEqual(defaults.learning_steps, ["1m", "10m"])

const userParams = mergeFsrsParams({ request_retention: 0.92 })
assert.equal(userParams.request_retention, 0.92)

assert.equal(clampRetention(0.5), 0.8)
assert.equal(clampRetention(0.99), 0.95)

const merged = mergeFsrsParams({ request_retention: 0.82 }, { request_retention: 0.88 })
assert.equal(merged.request_retention, 0.88)

const items = buildTrainingItems([
  { card_id: "a", rating: 3, reviewed_at: "2026-01-01T10:00:00Z" },
  { card_id: "a", rating: 3, reviewed_at: "2026-01-03T10:00:00Z" },
  { card_id: "b", rating: 1, reviewed_at: "2026-01-02T10:00:00Z" },
])
assert.equal(items.length, 2)
const cardA = items.find((i) => i.reviews.length === 2)
assert.ok(cardA)
assert.equal(cardA.reviews[0].rating, 3)
assert.equal(cardA.reviews[0].deltaT, 0)
assert.equal(cardA.reviews[1].deltaT, 2)

const single = buildTrainingItems([
  { card_id: "a", rating: 0, reviewed_at: "2026-01-01T10:00:00Z" },
  { card_id: "a", rating: 3, reviewed_at: "2026-01-02T10:00:00Z" },
])
assert.equal(single[0].reviews.length, 1)
assert.equal(single[0].reviews[0].rating, 3)

console.log("fsrs-optimizer.test.ts: ok")
