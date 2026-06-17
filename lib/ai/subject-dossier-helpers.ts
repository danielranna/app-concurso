import type { BehavioralAuditQuestionItem, PerQuestionError } from "../coach-types"

export type DossierErrorRecord = {
  question_id: string
  tec_id?: number
  tec_topic?: string
  error_taxonomy?: string
  specific_mistake?: string
  misconception?: string
  feedback_detailed?: string
  user_note?: string
  statement_excerpt?: string
  report_ids: string[]
  recurrence: number
  richness_score: number
}

export function richnessScore(
  eq: PerQuestionError | BehavioralAuditQuestionItem
): number {
  let score = 0
  const perQ = eq as PerQuestionError
  if (perQ.feedback_detailed?.trim()) score += 40
  if (perQ.misconception?.trim()) score += 25
  if (perQ.specific_mistake?.trim()) score += 20
  if (perQ.error_taxonomy) score += 10
  if (perQ.user_note?.trim() || (eq as BehavioralAuditQuestionItem).note_body?.trim())
    score += 8
  if (perQ.evidence?.length) score += 5
  const audit = eq as BehavioralAuditQuestionItem
  if (audit.feedback?.trim()) score += 35
  return score
}

export function mergeDossierErrorRecords(
  existing: DossierErrorRecord,
  incoming: DossierErrorRecord
): DossierErrorRecord {
  const reportSet = new Set([...existing.report_ids, ...incoming.report_ids])
  const merged: DossierErrorRecord = {
    ...existing,
    recurrence: existing.recurrence + 1,
    report_ids: [...reportSet],
  }
  if (incoming.richness_score > existing.richness_score) {
    merged.tec_id = incoming.tec_id ?? existing.tec_id
    merged.tec_topic = incoming.tec_topic ?? existing.tec_topic
    merged.error_taxonomy = incoming.error_taxonomy ?? existing.error_taxonomy
    merged.specific_mistake = incoming.specific_mistake ?? existing.specific_mistake
    merged.misconception = incoming.misconception ?? existing.misconception
    merged.feedback_detailed =
      incoming.feedback_detailed ?? existing.feedback_detailed
    merged.user_note = incoming.user_note ?? existing.user_note
    merged.statement_excerpt =
      incoming.statement_excerpt ?? existing.statement_excerpt
    merged.richness_score = incoming.richness_score
  }
  return merged
}

export function dedupeDossierErrors(rows: DossierErrorRecord[]): DossierErrorRecord[] {
  const byQ = new Map<string, DossierErrorRecord>()
  for (const row of rows) {
    const prev = byQ.get(row.question_id)
    byQ.set(row.question_id, prev ? mergeDossierErrorRecords(prev, row) : row)
  }
  return [...byQ.values()].sort(
    (a, b) => b.recurrence - a.recurrence || b.richness_score - a.richness_score
  )
}
