import assert from "node:assert/strict"
import { heuristicClassify } from "./error-taxonomy-heuristic"
import { mergeUnifiedExplainIntoErrors } from "./merge-unified-errors"
import type { NotebookAuditPayload } from "./notebook-audit-payload"
import type { BehavioralAudit, PerQuestionError } from "../coach-types"

function baseRow(
  overrides: Partial<Parameters<typeof heuristicClassify>[0]>
) {
  return {
    attempt_id: "a1",
    question_id: "q1",
    duration_ms: 60_000,
    outcome_category: "lacuna_critica",
    confidence_level: "seguro",
    is_correct: false,
    selected_answer: "A",
    correct_answer: "B",
    tec_id: 1,
    tec_topic: "LRF",
    statement: "Prazo para recondução do limite de despesa?",
    banca: "CESPE",
    ano: 2024,
    orgao: null,
    user_note: "",
    notes: [],
    prior_correct_count: 0,
    priority_score: 1,
    ...overrides,
  }
}

// --- heuristicClassify ---

{
  const r = heuristicClassify(
    baseRow({ user_note: "Confundi o prazo de publicação do RREO" })
  )
  assert.equal(r.taxonomy, "falta_memorizacao")
}

{
  const r = heuristicClassify(
    baseRow({
      prior_correct_count: 3,
      duration_ms: 15_000,
      confidence_level: "seguro",
    })
  )
  assert.equal(r.taxonomy, "desatencao")
}

{
  const r = heuristicClassify(
    baseRow({
      outcome_category: "conhecimento_fragil",
      is_correct: true,
      confidence_level: "inseguro",
    })
  )
  assert.equal(r.taxonomy, "falta_compreensao")
  assert.notEqual(r.taxonomy, "pegadinha_interpretacao")
}

{
  const r = heuristicClassify(baseRow({ user_note: "", outcome_category: "unknown" }))
  assert.equal(r.taxonomy, "nao_aplicavel")
}

// --- merge: yellow sem taxonomy da IA de explicação não vira pegadinha ---

{
  const payload: NotebookAuditPayload = {
    notebook_id: "nb1",
    notebook_name: "Test",
    subject_name: "AFO",
    questions: [
      {
        question_index: 1,
        question_id: "qy1",
        attempt_id: "att1",
        tec_id: 1,
        tec_topic: "Tópico",
        banca: null,
        ano: null,
        orgao: null,
        header_label: "Q1",
        statement: "Enunciado",
        statement_excerpt: "Enunciado",
        selected_answer: "A",
        correct_answer: "B",
        is_correct: true,
        outcome_category: "conhecimento_fragil",
        confidence_level: "inseguro",
        duration_ms: 50_000,
        user_note: "Quase errei",
        note_entries: [],
        zone: "yellow",
      },
    ],
    performance_summary: {
      correct: 1,
      total: 1,
      pct: 100,
      avg_duration_ms: 50_000,
      groups: { red: 0, yellow: 1, green: 0 },
    },
  }

  const classified: PerQuestionError[] = [
    {
      question_id: "qy1",
      error_taxonomy: "falta_compreensao",
      zone: "yellow",
      evidence: ["Acertou com insegurança"],
      classification_source: "heuristic",
    },
  ]

  const audit: BehavioralAudit = {
    performance_summary: payload.performance_summary,
    red_zone: [],
    yellow_zone: [
      {
        question_index: 1,
        question_id: "qy1",
        header_label: "Q1",
        statement_excerpt: "Enunciado",
        marked: "A",
        answer_key: "B",
        feedback: "Feedback genérico",
        source: "ai_generated",
      },
    ],
    green_zone: { mastered_indexes: [], theory_balance: "" },
    generated_at: new Date().toISOString(),
  }

  const merged = mergeUnifiedExplainIntoErrors(classified, audit, payload)
  const item = merged.find((e) => e.question_id === "qy1")
  assert.ok(item)
  assert.equal(item!.error_taxonomy, "falta_compreensao")
  assert.notEqual(item!.error_taxonomy, "pegadinha_interpretacao")
}

console.log("error-classifier.test.ts: all assertions passed")
