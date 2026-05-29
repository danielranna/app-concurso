import type { ErrorTaxonomy, PerQuestionError } from "../coach-types"
import type { NotebookAuditQuestion } from "./notebook-audit-payload"
import {
  resolveOptionText,
  type QuestionOption,
} from "./question-option-utils"

export type ExplainMode = "red_yellow" | "green_note_only"

export function filterGreenNoteQuestions(
  questions: NotebookAuditQuestion[]
): NotebookAuditQuestion[] {
  return questions.filter(
    (q) => q.zone === "green" && q.user_note.trim().length > 0
  )
}

export function buildExplainLlmItem(
  q: NotebookAuditQuestion,
  options: QuestionOption[],
  perQuestion?: PerQuestionError,
  mode: ExplainMode = "red_yellow"
) {
  const markedText = resolveOptionText(q.selected_answer, options)
  const correctText = resolveOptionText(q.correct_answer, options)

  return {
    mode,
    question_index: q.question_index,
    question_id: q.question_id,
    header_label: q.header_label,
    tec_topic: q.tec_topic,
    statement_excerpt: q.statement_excerpt,
    options,
    marked: q.selected_answer,
    marked_option_text: markedText,
    answer_key: q.correct_answer,
    correct_option_text: correctText,
    is_correct: q.is_correct,
    outcome_category: q.outcome_category,
    confidence_level: q.confidence_level,
    user_note: q.user_note || null,
    zone: q.zone,
    error_taxonomy_hint: perQuestion?.error_taxonomy ?? null,
    specific_mistake: perQuestion?.specific_mistake ?? null,
    classification_evidence: perQuestion?.evidence ?? null,
  }
}

function firstSentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ""
  const match = trimmed.match(/^[^.!?]+[.!?]?/)
  return match ? match[0].trim() : trimmed.slice(0, 120)
}

export function buildFallbackFeedback(
  q: NotebookAuditQuestion,
  options: QuestionOption[],
  mode: ExplainMode,
  taxonomyHint?: ErrorTaxonomy
): string {
  const marked = q.selected_answer
  const key = q.correct_answer
  const markedText = resolveOptionText(marked, options)
  const correctText = resolveOptionText(key, options)
  const stmtHint = firstSentence(q.statement_excerpt)

  if (mode === "green_note_only") {
    let feedback = `Você acertou (marcada [${key}]).`
    if (stmtHint) {
      feedback += ` O enunciado trata de: ${stmtHint}`
    }
    if (q.user_note) {
      feedback += ` Sobre sua nota — "${q.user_note}" — o ponto central é confrontar esse raciocínio com o conceito do enunciado`
      if (correctText) {
        feedback += ` e com o gabarito (${key}: ${correctText})`
      }
      feedback += "."
    }
    return feedback
  }

  let feedback = q.is_correct
    ? `Você acertou (marcada [${marked}] | gabarito [${key}]), mas houve sinal de fragilidade (${q.outcome_category}).`
    : `Você errou: marcou [${marked}] e o gabarito é [${key}].`

  if (markedText && !q.is_correct) {
    feedback += ` A alternativa ${marked} (${markedText}) não responde ao que o enunciado pede.`
  }
  if (correctText) {
    feedback += ` O gabarito ${key} (${correctText}) encaixa porque reflete o conceito cobrado.`
  } else if (stmtHint) {
    feedback += ` O enunciado foca em: ${stmtHint}`
  }

  if (q.user_note) {
    feedback += ` Sua nota — "${q.user_note}" — indica onde revisar:`
    if (taxonomyHint === "falta_compreensao") {
      feedback += " há confusão conceitual entre ideias parecidas; compare cada alternativa com o trecho-chave do enunciado."
    } else if (taxonomyHint === "falta_memorizacao") {
      feedback += " falta fixar o dado ou definição exata cobrados pela banca."
    } else {
      feedback += " confronte esse raciocínio com o gabarito e descarte distratores que não conversam com o enunciado."
    }
  } else if (q.tec_topic) {
    feedback += ` Revise ${q.tec_topic} com foco no trecho central do enunciado.`
  }

  return feedback
}

export function buildFallbackAuditItem(
  q: NotebookAuditQuestion,
  options: QuestionOption[],
  mode: ExplainMode,
  taxonomyHint?: ErrorTaxonomy
) {
  return {
    question_index: q.question_index,
    question_id: q.question_id,
    header_label: q.header_label,
    statement_excerpt: q.statement_excerpt.slice(0, 400),
    marked: q.selected_answer,
    answer_key: q.correct_answer,
    user_note: q.user_note || undefined,
    outcome_category: q.outcome_category,
    confidence_level: q.confidence_level,
    feedback: buildFallbackFeedback(q, options, mode, taxonomyHint),
    source: "ai_generated" as const,
    error_taxonomy: mode === "red_yellow" ? taxonomyHint : undefined,
  }
}
