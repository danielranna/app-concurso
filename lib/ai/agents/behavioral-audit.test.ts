import assert from "node:assert/strict"
import {
  buildExplainLlmItem,
  buildFallbackFeedback,
  filterGreenNoteQuestions,
} from "../behavioral-audit-helpers"
import type { NotebookAuditQuestion } from "../notebook-audit-payload"
import { UNIFIED_EXPLAIN_SYSTEM_PROMPT } from "../prompts/unified-explain-prompt"
import { resolveOptionText } from "../question-option-utils"

function baseQuestion(
  overrides: Partial<NotebookAuditQuestion> = {}
): NotebookAuditQuestion {
  return {
    question_index: 1,
    question_id: "q1",
    attempt_id: "a1",
    tec_id: 1,
    tec_topic: "Microeconomia",
    banca: "CESPE",
    ano: 2024,
    orgao: null,
    header_label: "Q1",
    statement: "Enunciado completo sobre externalidades e guerra fiscal.",
    statement_excerpt: "No Brasil, há competição entre estados para atrair investimento.",
    selected_answer: "B",
    correct_answer: "E",
    is_correct: false,
    outcome_category: "lacuna_critica",
    confidence_level: "seguro",
    duration_ms: 60_000,
    user_note: "falha de mercado era só monopólio",
    zone: "red",
    ...overrides,
  }
}

const options = [
  { label: "B", text: "risco moral." },
  { label: "E", text: "externalidade." },
]

// --- buildExplainLlmItem ---
{
  const item = buildExplainLlmItem(
    baseQuestion(),
    options,
    {
      question_id: "q1",
      tec_id: 1,
      tec_topic: "Microeconomia",
      error_taxonomy: "falta_compreensao",
      specific_mistake: "Confundiu risco moral com externalidade",
      evidence: ["Nota reduz falhas de mercado a estrutura"],
      priority_score: 10,
    },
    "red_yellow"
  )

  assert.equal(item.mode, "red_yellow")
  assert.deepEqual(item.options, options)
  assert.equal(item.marked_option_text, "risco moral.")
  assert.equal(item.correct_option_text, "externalidade.")
  assert.equal(item.specific_mistake, "Confundiu risco moral com externalidade")
  assert.deepEqual(item.classification_evidence, [
    "Nota reduz falhas de mercado a estrutura",
  ])
}

// --- resolveOptionText ---
{
  assert.equal(resolveOptionText("b", options), "risco moral.")
  assert.equal(resolveOptionText("Z", options), null)
}

// --- filterGreenNoteQuestions ---
{
  const greenWithNote = baseQuestion({
    zone: "green",
    is_correct: true,
    user_note: "achei que excesso saía da eficiência de Pareto",
    selected_answer: "C",
    correct_answer: "C",
  })
  const greenNoNote = baseQuestion({ zone: "green", is_correct: true, user_note: "" })
  const red = baseQuestion({ zone: "red", user_note: "dúvida" })

  const filtered = filterGreenNoteQuestions([greenWithNote, greenNoNote, red])
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.question_id, "q1")
}

{
  const item = buildExplainLlmItem(
    baseQuestion({
      zone: "green",
      is_correct: true,
      user_note: "dúvida sobre Pareto",
    }),
    options,
    undefined,
    "green_note_only"
  )
  assert.equal(item.mode, "green_note_only")
  assert.equal(item.error_taxonomy_hint, null)
}

// --- buildFallbackFeedback ---
{
  const fb = buildFallbackFeedback(baseQuestion(), options, "red_yellow", "falta_compreensao")
  assert.match(fb, /Você errou/)
  assert.match(fb, /risco moral/)
  assert.match(fb, /externalidade/)
  assert.match(fb, /falha de mercado era só monopólio/)
  assert.doesNotMatch(fb, /Revise o conceito no enunciado e confronte com o gabarito/)
}

{
  const fb = buildFallbackFeedback(
    baseQuestion({
      zone: "green",
      is_correct: true,
      user_note: "achei que excesso saía da eficiência de Pareto",
      selected_answer: "C",
      correct_answer: "C",
    }),
    [{ label: "C", text: "Certo." }],
    "green_note_only"
  )
  assert.match(fb, /Você acertou/)
  assert.match(fb, /Sobre sua nota/)
  assert.doesNotMatch(fb, /Você errou/)
}

// --- prompt ---
{
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /red_yellow/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /green_note_only/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /green_note_zone/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /PROIBIDO texto genérico/)
}

console.log("behavioral-audit.test.ts: all assertions passed")
