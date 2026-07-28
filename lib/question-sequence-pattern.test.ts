import assert from "node:assert/strict"
import {
  classifySequencePattern,
  hadCorrectStreakThenWrong,
  sequencePreview,
} from "./question-sequence-pattern"

// User examples
{
  // acertei errei acertei errei errei acertei
  const r = classifySequencePattern([true, false, true, false, false, true])
  assert.equal(r.pattern, "confusao")
  assert.equal(r.sequence_preview, "A-E-A-E-E-A")
}

{
  // errei acertei acertei acertei acertei
  const r = classifySequencePattern([false, true, true, true, true])
  assert.equal(r.pattern, "aprendizado")
  assert.equal(r.trailing_correct, 4)
}

{
  // errei acertei acertei acertei acertei errei
  const r = classifySequencePattern([false, true, true, true, true, false])
  assert.equal(r.pattern, "esquecimento")
  assert.ok(hadCorrectStreakThenWrong([false, true, true, true, true, false]))
}

// Edge cases
{
  const r = classifySequencePattern([false, true, true])
  assert.equal(r.pattern, null) // n < 4
}

{
  const r = classifySequencePattern([true, true, true, true])
  assert.equal(r.pattern, null) // só acertos
}

{
  const r = classifySequencePattern([false, false, false, false])
  assert.equal(r.pattern, null) // só erros
}

{
  // W C C C — aprendizado
  const r = classifySequencePattern([false, true, true, true])
  assert.equal(r.pattern, "aprendizado")
}

{
  // Esquecimento ganha sobre confusão/aprendizado
  const r = classifySequencePattern([
    false,
    true,
    false,
    true,
    true,
    true,
    false,
  ])
  assert.equal(r.pattern, "esquecimento")
}

{
  assert.equal(sequencePreview([true, false, true]), "A-E-A")
}

console.log("question-sequence-pattern: ok")
