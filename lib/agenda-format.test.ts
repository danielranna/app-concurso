import assert from "node:assert/strict"
import { formatAgendaMoney, formatAgendaNumber } from "./agenda-format"

assert.equal(formatAgendaNumber("18430"), "18.430")
assert.equal(formatAgendaNumber("18.430"), "18.430")
assert.equal(formatAgendaNumber("0"), "0")
assert.equal(formatAgendaNumber(""), "")

assert.equal(formatAgendaMoney("18430"), "R$ 18.430,00")
assert.equal(formatAgendaMoney("18430,5"), "R$ 18.430,50")
assert.equal(formatAgendaMoney("18430,50"), "R$ 18.430,50")
assert.equal(formatAgendaMoney("18.430,5"), "R$ 18.430,50")
assert.equal(formatAgendaMoney("R$ 18.430,00"), "R$ 18.430,00")
assert.equal(formatAgendaMoney(""), "")

console.log("agenda-format.test.ts: ok")
