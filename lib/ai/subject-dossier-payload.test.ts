import assert from "node:assert/strict"
import {
  dedupeDossierErrors,
  mergeDossierErrorRecords,
  type DossierErrorRecord,
} from "./subject-dossier-helpers"

function baseRecord(
  overrides: Partial<DossierErrorRecord> = {}
): DossierErrorRecord {
  return {
    question_id: "q1",
    report_ids: ["r1"],
    recurrence: 1,
    richness_score: 10,
    ...overrides,
  }
}

{
  const a = baseRecord({
    specific_mistake: "erro A",
    richness_score: 15,
    report_ids: ["r1"],
  })
  const b = baseRecord({
    specific_mistake: "erro B detalhado",
    feedback_detailed: "explicação longa",
    richness_score: 45,
    report_ids: ["r2"],
  })
  const merged = mergeDossierErrorRecords(a, b)
  assert.equal(merged.recurrence, 2)
  assert.equal(merged.report_ids.length, 2)
  assert.equal(merged.feedback_detailed, "explicação longa")
}

{
  const rows = dedupeDossierErrors([
    baseRecord({ question_id: "q1", report_ids: ["r1"], richness_score: 10 }),
    baseRecord({
      question_id: "q1",
      report_ids: ["r2"],
      richness_score: 30,
      feedback_detailed: "melhor",
    }),
    baseRecord({ question_id: "q2", report_ids: ["r1"] }),
  ])
  assert.equal(rows.length, 2)
  const q1 = rows.find((r) => r.question_id === "q1")!
  assert.equal(q1.recurrence, 2)
  assert.equal(q1.feedback_detailed, "melhor")
}

console.log("subject-dossier-payload.test.ts: all assertions passed")
