import type {
  BehavioralAuditQuestionItem,
  ErrorTaxonomy,
  FeedbackSource,
} from "../coach-types"
import type { ClassificationResult } from "./error-classifier-types"
import type { NotebookAuditQuestion } from "./notebook-audit-payload"
import { combinePendingNoteBodies, splitPendingNoteEntries } from "../note-entry-utils"
import {
  persistNoteEntryAiResult,
  type QuestionNoteEntryRow,
} from "../question-notes"
import {
  buildFallbackAuditItem,
  type ExplainMode,
} from "./behavioral-audit-helpers"
import { isSubstantiveClarification } from "./note-clarifications"
import type { QuestionOption } from "./question-option-utils"

export type ExplainWorkItem = {
  key: string
  question: NotebookAuditQuestion
  entry: QuestionNoteEntryRow | null
  zone: "red" | "yellow" | "green_note"
  mode: ExplainMode
}

export function parseStoredClassify(
  raw: Record<string, unknown> | null
): ClassificationResult | null {
  if (!raw) return null
  const taxonomy = raw.taxonomy as ErrorTaxonomy | undefined
  if (!taxonomy) return null
  return {
    taxonomy,
    evidence: Array.isArray(raw.evidence)
      ? (raw.evidence as string[]).slice(0, 4)
      : [],
    specific_mistake:
      typeof raw.specific_mistake === "string"
        ? raw.specific_mistake
        : undefined,
    confidence:
      raw.confidence === "alta" ||
      raw.confidence === "media" ||
      raw.confidence === "baixa"
        ? raw.confidence
        : undefined,
    source:
      raw.source === "llm_classify" || raw.source === "heuristic"
        ? raw.source
        : "heuristic",
  }
}

export function classifyResultToStored(c: ClassificationResult) {
  return {
    taxonomy: c.taxonomy,
    evidence: c.evidence,
    specific_mistake: c.specific_mistake,
    confidence: c.confidence,
    source: c.source,
  }
}

export function cachedEntryToAuditItem(
  entry: QuestionNoteEntryRow,
  q: NotebookAuditQuestion,
  options: QuestionOption[],
  mode: ExplainMode,
  taxonomyHint?: ErrorTaxonomy
): BehavioralAuditQuestionItem {
  const classify = parseStoredClassify(entry.ai_classify)
  const fallback = buildFallbackAuditItem(
    { ...q, user_note: entry.body },
    options,
    mode,
    taxonomyHint ?? classify?.taxonomy
  )
  const clarification = isSubstantiveClarification(entry.ai_feedback)
    ? entry.ai_feedback!.trim()
    : undefined
  return {
    ...fallback,
    note_entry_id: entry.id,
    note_body: entry.body,
    user_note: entry.body,
    feedback: mode === "green_note_only" ? "" : fallback.feedback,
    note_clarification: clarification,
    misconception:
      classify?.specific_mistake ??
      (fallback as { misconception?: string }).misconception,
    error_taxonomy:
      mode === "red_yellow"
        ? taxonomyHint ?? classify?.taxonomy ?? fallback.error_taxonomy
        : undefined,
    source: "ai_generated" as FeedbackSource,
  }
}

function processZoneEntries(
  questions: NotebookAuditQuestion[],
  zone: "red" | "yellow" | "green_note",
  mode: ExplainMode,
  pending: ExplainWorkItem[],
  cached: BehavioralAuditQuestionItem[],
  optionsByQ: Map<string, QuestionOption[]>
) {
  for (const q of questions) {
    const entries = (q.note_entries ?? []).filter((e) => e.body.trim())
    if (entries.length === 0) {
      if (zone !== "green_note") {
        pending.push({
          key: `q:${q.question_id}`,
          question: q,
          entry: null,
          zone,
          mode,
        })
      }
      continue
    }

    const { pending: pEntries, cached: cEntries } =
      splitPendingNoteEntries(entries)
    const opts = optionsByQ.get(q.question_id) ?? []
    for (const entry of cEntries) {
      if (entry.ai_feedback) {
        cached.push(cachedEntryToAuditItem(entry, q, opts, mode))
      }
    }
    for (const entry of pEntries) {
      pending.push({
        key: entry.id,
        question: q,
        entry,
        zone,
        mode,
      })
    }
  }
}

export function collectExplainWorkItems(
  payload: { questions: NotebookAuditQuestion[] },
  filterGreen: (qs: NotebookAuditQuestion[]) => NotebookAuditQuestion[],
  optionsByQ: Map<string, QuestionOption[]>
): {
  pending: ExplainWorkItem[]
  cachedRed: BehavioralAuditQuestionItem[]
  cachedYellow: BehavioralAuditQuestionItem[]
  cachedGreenNote: BehavioralAuditQuestionItem[]
} {
  const pending: ExplainWorkItem[] = []
  const cachedRed: BehavioralAuditQuestionItem[] = []
  const cachedYellow: BehavioralAuditQuestionItem[] = []
  const cachedGreenNote: BehavioralAuditQuestionItem[] = []

  processZoneEntries(
    payload.questions.filter((q) => q.zone === "red"),
    "red",
    "red_yellow",
    pending,
    cachedRed,
    optionsByQ
  )
  processZoneEntries(
    payload.questions.filter((q) => q.zone === "yellow"),
    "yellow",
    "red_yellow",
    pending,
    cachedYellow,
    optionsByQ
  )
  processZoneEntries(
    filterGreen(payload.questions),
    "green_note",
    "green_note_only",
    pending,
    cachedGreenNote,
    optionsByQ
  )

  return { pending, cachedRed, cachedYellow, cachedGreenNote }
}

export async function persistClassifyOnPendingEntries(
  question: NotebookAuditQuestion,
  classified: ClassificationResult,
  modelUsed: string
) {
  const { pending } = splitPendingNoteEntries(question.note_entries ?? [])
  const stored = classifyResultToStored(classified)
  for (const entry of pending) {
    await persistNoteEntryAiResult(entry.id, {
      ai_classify: stored,
      ai_model_used: modelUsed,
      mergeClassify: true,
    })
  }
}

export async function persistExplainOnEntry(
  entryId: string | null,
  feedback: string,
  zone: "red" | "yellow" | "green_note",
  modelUsed: string,
  misconception?: string
) {
  if (!entryId) return
  const classifyPatch = misconception
    ? { specific_mistake: misconception }
    : undefined
  await persistNoteEntryAiResult(entryId, {
    ai_feedback: feedback,
    ai_audit_zone: zone,
    ai_model_used: modelUsed,
    ai_classify: classifyPatch ?? undefined,
    mergeClassify: Boolean(classifyPatch),
  })
}

export function questionHasPendingNotes(q: NotebookAuditQuestion): boolean {
  const { pending } = splitPendingNoteEntries(q.note_entries ?? [])
  if (pending.length > 0) return true
  const zone = q.zone
  if (zone === "red" || zone === "yellow") {
    return !(q.note_entries ?? []).some((e) => e.ai_classify)
  }
  if (zone === "green" && q.user_note.trim()) {
    return !(q.note_entries ?? []).some((e) => e.ai_feedback)
  }
  return false
}

export function pendingNoteTextForQuestion(q: NotebookAuditQuestion): string {
  return combinePendingNoteBodies(q.note_entries ?? [])
}
