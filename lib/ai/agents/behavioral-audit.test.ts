import assert from "node:assert/strict"
import {
  buildExplainLlmItem,
  buildFallbackFeedback,
  filterGreenNoteQuestions,
} from "../behavioral-audit-helpers"
import type { NotebookAuditQuestion } from "../notebook-audit-payload"
import { NOTE_CLARIFICATION_SYSTEM } from "../prompts/note-clarification-prompt"
import { UNIFIED_EXPLAIN_SYSTEM_PROMPT } from "../prompts/unified-explain-prompt"
import {
  clipStatementForLlm,
  STATEMENT_LLM_MAX_CHARS,
  STATEMENT_TRUNCATED_SUFFIX,
} from "../prompts/statement-for-llm"
import { isUmbrellaExplainFeedback } from "../prompts/tutor-grounding"
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
    note_entries: [],
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
  assert.equal(
    item.statement,
    "Enunciado completo sobre externalidades e guerra fiscal."
  )
  assert.ok(!("statement_excerpt" in item))
}

// --- clipStatementForLlm ---
{
  assert.equal(clipStatementForLlm("curto"), "curto")
  const long = "x".repeat(STATEMENT_LLM_MAX_CHARS + 50)
  const clipped = clipStatementForLlm(long)
  assert.ok(clipped.endsWith(STATEMENT_TRUNCATED_SUFFIX))
  assert.equal(clipped.length, STATEMENT_LLM_MAX_CHARS)
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
  assert.match(fb, /Você errou porque/)
  assert.match(fb, /risco moral/)
  assert.match(fb, /externalidade/)
  assert.match(fb, /falha de mercado era só monopólio/)
  assert.doesNotMatch(fb, /reflete o conceito cobrado/)
  assert.doesNotMatch(fb, /não responde ao que o enunciado pede/)
  assert.doesNotMatch(fb, /compare cada alternativa com o trecho-chave/)
}

{
  const leiQ = baseQuestion({
    statement:
      "O direito financeiro brasileiro exige, frequentemente, regulação por leis complementares. Assinale a opção que apresenta matéria cujas normas gerais exigem lei complementar.",
    statement_excerpt:
      "O direito financeiro brasileiro exige, frequentemente, regulação por leis complementares.",
    selected_answer: "C",
    correct_answer: "E",
    user_note: "Fiquei com dúvida também na A",
  })
  const leiOpts = [
    { label: "A", text: "matéria hipotética A de teste." },
    {
      label: "C",
      text: "operações de câmbio realizadas pelos entes públicos, à exceção da União, regulamentada por atos do Banco Central.",
    },
    {
      label: "E",
      text: "condições e limites para concessão, ampliação ou prorrogação de incentivo ou benefício de natureza tributária.",
    },
  ]
  const fb = buildFallbackFeedback(leiQ, leiOpts, "red_yellow", "falta_compreensao")
  assert.match(fb, /lei complementar/)
  assert.match(fb, /câmbio/)
  assert.match(fb, /incentivo ou benefício/)
  assert.match(fb, /\bA\b/)
  assert.doesNotMatch(fb, /reflete o conceito cobrado/)
  assert.doesNotMatch(fb, /há confusão conceitual entre ideias parecidas/)
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

// --- prompt regression (texto; não valida comportamento do modelo) ---
{
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /CÁLCULO/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /ANTI-ALUCINAÇÃO/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /EXPLICAÇÃO CONCEITUAL/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /APENAS com um único objeto JSON/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /bater EXATAMENTE/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /NÃO force/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /MESMA formatação/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /reflete o conceito cobrado/)
  assert.match(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /red_yellow/)
  assert.doesNotMatch(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /green_note_only/)
  assert.doesNotMatch(UNIFIED_EXPLAIN_SYSTEM_PROMPT, /green_note_zone/)

  assert.match(NOTE_CLARIFICATION_SYSTEM, /CÁLCULO/)
  assert.match(NOTE_CLARIFICATION_SYSTEM, /ANTI-ALUCINAÇÃO/)
  assert.match(NOTE_CLARIFICATION_SYSTEM, /APENAS com um único objeto JSON/)
  assert.match(NOTE_CLARIFICATION_SYSTEM, /bater EXATAMENTE/)
  assert.match(NOTE_CLARIFICATION_SYSTEM, /NÃO force/)
  assert.match(NOTE_CLARIFICATION_SYSTEM, /MESMA formatação/)
}

{
  assert.equal(
    isUmbrellaExplainFeedback(
      "O gabarito E encaixa porque reflete o conceito cobrado."
    ),
    true
  )
  assert.equal(
    isUmbrellaExplainFeedback(
      "Você errou porque a C fala de atos do Bacen e o enunciado pede lei complementar; E trata de incentivos tributários."
    ),
    false
  )
}

console.log("behavioral-audit.test.ts: all assertions passed")
