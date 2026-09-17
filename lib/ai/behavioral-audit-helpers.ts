import type { ErrorTaxonomy, PerQuestionError } from "../coach-types"
import type { NotebookAuditQuestion } from "./notebook-audit-payload"
import { clipStatementForLlm } from "./prompts/statement-for-llm"
import {
  resolveOptionText,
  type QuestionOption,
} from "./question-option-utils"

export type ExplainMode = "red_yellow" | "green_note_only"

export function filterGreenNoteQuestions(
  questions: NotebookAuditQuestion[]
): NotebookAuditQuestion[] {
  return questions.filter(
    (q) =>
      q.zone === "green" &&
      ((q.note_entries ?? []).some((e) => e.body.trim().length > 0) ||
        q.user_note.trim().length > 0)
  )
}

export function buildExplainLlmItem(
  q: NotebookAuditQuestion,
  options: QuestionOption[],
  perQuestion?: PerQuestionError,
  mode: ExplainMode = "red_yellow",
  noteEntry?: { id: string; body: string } | null
) {
  const noteText = noteEntry?.body?.trim() || q.user_note || ""
  const markedText = resolveOptionText(q.selected_answer, options)
  const correctText = resolveOptionText(q.correct_answer, options)

  return {
    mode,
    note_entry_id: noteEntry?.id ?? null,
    question_index: q.question_index,
    question_id: q.question_id,
    header_label: q.header_label,
    tec_topic: q.tec_topic,
    statement: clipStatementForLlm(q.statement || q.statement_excerpt),
    options,
    marked: q.selected_answer,
    marked_option_text: markedText,
    answer_key: q.correct_answer,
    correct_option_text: correctText,
    is_correct: q.is_correct,
    outcome_category: q.outcome_category,
    confidence_level: q.confidence_level,
    user_note: noteText || null,
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

/** Critério cobrado: prioriza o trecho após "Assinale"/"marque" ou a última frase do enunciado. */
export function extractStatementCriterion(statement: string): string {
  const text = statement.trim()
  if (!text) return ""
  const assinale = text.match(
    /(?:Assinale|Marque|Indique|Identifique)[^.!?]*[.!?]?/i
  )
  if (assinale?.[0]?.trim()) return assinale[0].trim()
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim())
  if (sentences.length >= 2) return sentences[sentences.length - 1]!.trim()
  return firstSentence(text)
}

/** Letras A–E citadas na nota do aluno (exceto a marcada, se passada). */
export function extractMentionedOptionLetters(
  note: string,
  exclude?: string | null
): string[] {
  const excludeU = (exclude ?? "").trim().toUpperCase()
  const found = new Set<string>()
  const patterns = [
    /\b(?:alternativa|opção|letra)\s*([A-Ea-e])\b/gi,
    /\b(?:na|no|pela|pelo)\s+([A-Ea-e])\b/gi,
    /\b([A-Ea-e])\b(?=\s*(?:também|tbm|,|\.|$))/gi,
  ]
  for (const re of patterns) {
    for (const m of note.matchAll(re)) {
      const letter = m[1]?.toUpperCase()
      if (letter && letter !== excludeU && /[A-E]/.test(letter)) {
        found.add(letter)
      }
    }
  }
  return [...found]
}

function clipOption(text: string, max = 160): string {
  const t = text.trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).trimEnd() + "…"
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
  const statement = (q.statement || q.statement_excerpt || "").trim()
  const criterion = extractStatementCriterion(statement)

  if (mode === "green_note_only") {
    let feedback = `Você acertou (marcada [${key}]).`
    if (criterion) {
      feedback += ` Critério do enunciado: ${criterion}`
    }
    if (q.user_note) {
      feedback += ` Sobre sua nota — "${q.user_note}" — confronte esse raciocínio com o gabarito`
      if (correctText) {
        feedback += ` (${key}: ${clipOption(correctText, 120)})`
      }
      feedback += "."
    }
    return feedback
  }

  let feedback = q.is_correct
    ? `Você acertou (marcada [${marked}] | gabarito [${key}]), mas houve sinal de fragilidade (${q.outcome_category}).`
    : `Você errou porque a escolha [${marked}] não atende ao critério do enunciado`

  if (!q.is_correct && criterion) {
    feedback += ` — ${criterion}`
  } else if (!q.is_correct) {
    feedback += "."
  }

  if (!q.is_correct && markedText) {
    feedback += ` A marcada ${marked} ("${clipOption(markedText)}") não satisfaz esse filtro pelo próprio texto da alternativa.`
  } else if (!q.is_correct && !markedText) {
    feedback += ` Não há texto da alternativa marcada no input.`
  }

  if (correctText) {
    feedback += ` O gabarito ${key} ("${clipOption(correctText)}") é o item que o gabarito identifica como alinhado a esse critério.`
  } else if (criterion) {
    feedback += ` Relia o enunciado sob o critério citado e descarte alternativas que falam de outro regime.`
  }

  const note = q.user_note?.trim()
  if (note) {
    const letters = extractMentionedOptionLetters(note, marked)
    const extraBits: string[] = []
    for (const letter of letters.slice(0, 2)) {
      const optText = resolveOptionText(letter, options)
      if (optText) {
        extraBits.push(
          `${letter} ("${clipOption(optText, 100)}") com o mesmo critério do enunciado`
        )
      } else {
        extraBits.push(`a letra ${letter} com o mesmo critério do enunciado`)
      }
    }
    if (extraBits.length) {
      feedback += ` Sua nota ("${note}") aponta dúvida residual: confronte ${extraBits.join(" e ")}.`
    } else {
      feedback += ` Sua nota ("${note}") — use-a para confrontar o raciocínio com o critério do enunciado e o texto do gabarito ${key}.`
    }
  } else if (q.tec_topic) {
    feedback += ` Foque em ${q.tec_topic} sob o critério acima.`
  }

  // taxonomyHint reserved for callers; avoid generic taxonomy prose in fallback
  void taxonomyHint

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
