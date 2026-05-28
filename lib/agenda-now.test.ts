import assert from "node:assert/strict"
import {
  getActiveBlocks,
  getAgendaNowStatus,
  isBlockActive,
  timeToMinutes,
} from "./agenda-now"

function block(
  id: string,
  start: string,
  end: string,
  title = id
) {
  return { id, start_time: start, end_time: end, title }
}

function at(h: number, m = 0) {
  const d = new Date(2026, 4, 28, h, m, 0, 0)
  return d
}

assert.equal(timeToMinutes("06:00"), 360)
assert.equal(timeToMinutes("06:00:00"), 360)

const morning = block("1", "05:30:00", "06:00:00", "Rotina")
const study = block("2", "06:00:00", "12:00:00", "Concurso")
const overlap = block("3", "06:00:00", "09:00:00", "Paralelo")
const afternoon = block("4", "14:00:00", "16:00:00", "Tarde")

assert.equal(isBlockActive(study, 6 * 60), true)
assert.equal(isBlockActive(study, 12 * 60), false)
assert.equal(isBlockActive(morning, 6 * 60), false)

const activeOne = getActiveBlocks([morning, study, afternoon], at(7))
assert.equal(activeOne.length, 1)
assert.equal(activeOne[0]!.id, "2")

const activeOverlap = getActiveBlocks([study, overlap], at(7))
assert.equal(activeOverlap.length, 2)

const statusActive = getAgendaNowStatus([morning, study, afternoon], at(7, 30))!
assert.equal(statusActive.kind, "active")
assert.equal(statusActive.active[0]!.id, "2")

const statusBefore = getAgendaNowStatus([morning, study], at(5))!
assert.equal(statusBefore.kind, "before")
assert.equal(statusBefore.next.id, "1")

const statusBetween = getAgendaNowStatus([morning, study, afternoon], at(13))!
assert.equal(statusBetween.kind, "between")
assert.equal(statusBetween.next.id, "4")

const statusAfter = getAgendaNowStatus([morning, study], at(18))!
assert.equal(statusAfter.kind, "after")
assert.equal(statusAfter.last.id, "2")

console.log("agenda-now.test.ts: ok")
