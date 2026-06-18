import type {
  BehavioralAudit,
  PerQuestionError,
} from "../coach-types"
import type { NotebookAuditPayload } from "./notebook-audit-payload"

export function mergeUnifiedExplainIntoErrors(
  perQuestionErrors: PerQuestionError[],
  audit: BehavioralAudit,
  payload: NotebookAuditPayload
): PerQuestionError[] {
  const byQid = new Map(perQuestionErrors.map((e) => [e.question_id, { ...e }]))
  const auditItems = [...audit.red_zone, ...audit.yellow_zone]

  for (const item of auditItems) {
    const q = payload.questions.find((x) => x.question_id === item.question_id)
    const zone = q?.zone ?? "red"
    const source = item.source ?? "ai_generated"

    const patch: Partial<PerQuestionError> = {
      feedback_detailed: item.feedback,
      misconception: item.misconception,
      question_index: item.question_index,
      header_label: item.header_label,
      statement_excerpt: item.statement_excerpt,
      marked_answer: item.marked,
      correct_answer: item.answer_key,
      user_note: item.user_note,
      zone,
      outcome_category: item.outcome_category,
      confidence_level: item.confidence_level,
      feedback_source: source,
      explanation_source: source,
      explanation_citations: item.citations,
      explanation: undefined,
      note_clarification: item.note_clarification,
    }
    if (item.misconception) {
      patch.specific_mistake = item.misconception
      patch.misconception = item.misconception
    }

    const existing = byQid.get(item.question_id)
    if (existing) {
      Object.assign(existing, patch)
    } else {
      const baseTax =
        item.error_taxonomy ??
        perQuestionErrors.find((e) => e.question_id === item.question_id)
          ?.error_taxonomy ??
        "nao_aplicavel"
      byQid.set(item.question_id, {
        question_id: item.question_id,
        tec_id: q?.tec_id,
        tec_topic: q?.tec_topic,
        error_taxonomy: baseTax,
        ...patch,
      } as PerQuestionError)
    }
  }

  return [...byQid.values()].sort(
    (a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)
  )
}
