import type {
  BehavioralAudit,
  BehavioralAuditQuestionItem,
  PerQuestionError,
  SubjectStudyDossierStructured,
} from "../coach-types"
import { splitPendingNoteEntries, combineNoteBodies } from "../note-entry-utils"
import { persistExplainOnEntry } from "./note-incremental-audit"
import { runAgent } from "./run-agent"
import type { NotebookAuditPayload, NotebookAuditQuestion } from "./notebook-audit-payload"
import { filterGreenNoteQuestions } from "./behavioral-audit-helpers"
import { loadOptionsByQuestion } from "./question-options"
import type { DossierAnnotationInput } from "./subject-dossier-payload"

export const NOTE_CLARIFICATION_SYSTEM = `Você é tutor de concurso. Sua ÚNICA tarefa é esclarecer as dúvidas do aluno nas anotações (notes) de questões que ele acertou ou errou.

REGRAS:
1. Responda DIRETAMENTE à user_note — cada pergunta ou ponto levantado deve ter resposta explícita
2. Se a nota pedir definições, liste e explique cada conceito pedido de forma didática
3. Se a nota pedir exemplo numérico, cenário hipotético ("vamos supor", "como fica") ou comparação, inclua exemplo passo a passo com números concretos (mínimo 3 passos)
4. Use statement_excerpt, options e report_feedback como contexto — não invente trechos do enunciado
5. Se cached_feedback existir mas for genérico ou não responder à nota, substitua por resposta específica
6. Tom didático, português (BR), 4–8 frases por anotação quando a nota tiver dúvidas substantivas
7. PROIBIDO respostas vagas tipo "revise o conceito" ou só repetir definição sem ligar à dúvida

Responda JSON:
{
  "annotation_clarifications": [{
    "question_id": "uuid",
    "note_body": "cópia da nota",
    "answer_md": "resposta completa à dúvida",
    "linked_topics": ["tópico TEC"]
  }]
}

Inclua TODAS as anotações do input com o mesmo question_id.`

export type NoteClarificationItem = {
  question_id: string
  note_entry_id?: string | null
  note_body: string
  tec_topic?: string
  statement_excerpt?: string
  zone: "red" | "yellow" | "green_note"
  cached_feedback?: string
  report_feedback?: string
  error_taxonomy?: string
}

export type NoteClarificationsResult = {
  clarifications: SubjectStudyDossierStructured["annotation_clarifications"]
  byQuestionId: Map<string, string>
  usedLlm: boolean
  modelUsed: string
  tokensIn: number
  tokensOut: number
  costUsd: number
}

const SUBSTANTIVE_MIN_LENGTH = 80

export function isSubstantiveClarification(text: string | null | undefined): boolean {
  return (text?.trim().length ?? 0) >= SUBSTANTIVE_MIN_LENGTH
}

export function buildClarificationsFromCache(
  annotations: Array<{
    question_id: string
    note_body: string
    cached_feedback?: string
    tec_topic?: string
  }>
): SubjectStudyDossierStructured["annotation_clarifications"] {
  return annotations
    .filter((a) => a.note_body.trim())
    .map((a) => ({
      question_id: a.question_id,
      note_body: a.note_body,
      answer_md:
        isSubstantiveClarification(a.cached_feedback)
          ? a.cached_feedback!.trim()
          : a.cached_feedback?.trim() ||
            "Revise a explicação no relatório do caderno ou regenere as explicações com IA.",
      linked_topics: a.tec_topic ? [a.tec_topic] : [],
    }))
}

function questionHasNote(q: NotebookAuditQuestion): boolean {
  return (
    (q.note_entries ?? []).some((e) => e.body.trim().length > 0) ||
    q.user_note.trim().length > 0
  )
}

function zoneForQuestion(q: NotebookAuditQuestion): NoteClarificationItem["zone"] {
  if (q.zone === "green") return "green_note"
  if (q.zone === "yellow") return "yellow"
  return "red"
}

function reportFeedbackForQuestion(
  audit: BehavioralAudit | undefined,
  questionId: string
): string | undefined {
  if (!audit) return undefined
  const item =
    audit.red_zone.find((i) => i.question_id === questionId) ??
    audit.yellow_zone.find((i) => i.question_id === questionId)
  return item?.feedback?.slice(0, 800)
}

export function buildNotebookClarificationItems(
  payload: NotebookAuditPayload,
  taxonomyByQuestion: Map<string, PerQuestionError>,
  audit?: BehavioralAudit
): NoteClarificationItem[] {
  const withNotes = payload.questions.filter(questionHasNote)
  const items: NoteClarificationItem[] = []

  for (const q of withNotes) {
    const entries = (q.note_entries ?? []).filter((e) => e.body.trim())
    const zone = zoneForQuestion(q)
    const perQ = taxonomyByQuestion.get(q.question_id)
    const reportFeedback = reportFeedbackForQuestion(audit, q.question_id)

    if (entries.length === 0) {
      items.push({
        question_id: q.question_id,
        note_body: q.user_note.trim(),
        tec_topic: q.tec_topic,
        statement_excerpt: q.statement_excerpt,
        zone,
        report_feedback: reportFeedback,
        error_taxonomy: perQ?.error_taxonomy,
      })
      continue
    }

    for (const entry of entries) {
      items.push({
        question_id: q.question_id,
        note_entry_id: entry.id,
        note_body: entry.body.trim(),
        tec_topic: q.tec_topic,
        statement_excerpt: q.statement_excerpt,
        zone,
        cached_feedback: entry.ai_feedback?.trim() || undefined,
        report_feedback: reportFeedback,
        error_taxonomy: perQ?.error_taxonomy,
      })
    }
  }

  return items
}

function itemsToAgentInput(
  items: NoteClarificationItem[],
  optionsByQ: Map<string, { label: string; text: string }[]>,
  subjectName?: string
) {
  return {
    subject_name: subjectName,
    items: items.map((item) => ({
      question_id: item.question_id,
      note_body: item.note_body,
      tec_topic: item.tec_topic,
      statement_excerpt: item.statement_excerpt,
      options: (optionsByQ.get(item.question_id) ?? []).slice(0, 6),
      cached_feedback: item.cached_feedback,
      report_feedback: item.report_feedback,
      error_taxonomy: item.error_taxonomy,
    })),
  }
}

function parseClarificationResponse(
  text: string,
  sourceItems: NoteClarificationItem[]
): SubjectStudyDossierStructured["annotation_clarifications"] {
  const parsed = JSON.parse(text) as {
    annotation_clarifications?: SubjectStudyDossierStructured["annotation_clarifications"]
  }
  return (parsed.annotation_clarifications ?? [])
    .filter((c) => c.question_id && c.answer_md?.trim())
    .map((c) => {
      const src = sourceItems.find((n) => n.question_id === c.question_id)
      return {
        question_id: c.question_id,
        note_body: c.note_body?.trim() || src?.note_body || "",
        answer_md: c.answer_md.trim(),
        linked_topics:
          c.linked_topics?.length
            ? c.linked_topics
            : src?.tec_topic
              ? [src.tec_topic]
              : [],
      }
    })
}

export async function runNoteClarificationsAgent(params: {
  userId: string
  subjectId: string | null
  items: NoteClarificationItem[]
  subjectName?: string
  skipLlm?: boolean
  agentType?: "report" | "dossier"
}): Promise<NoteClarificationsResult> {
  const empty: NoteClarificationsResult = {
    clarifications: [],
    byQuestionId: new Map(),
    usedLlm: false,
    modelUsed: "rule-based",
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  }

  if (!params.items.length) return empty

  const cachedItems = params.items.filter((i) =>
    isSubstantiveClarification(i.cached_feedback)
  )
  const pendingItems = params.items.filter(
    (i) => !isSubstantiveClarification(i.cached_feedback)
  )

  const clarifications: SubjectStudyDossierStructured["annotation_clarifications"] =
    cachedItems.map((item) => ({
      question_id: item.question_id,
      note_body: item.note_body,
      answer_md: item.cached_feedback!.trim(),
      linked_topics: item.tec_topic ? [item.tec_topic] : [],
    }))

  let tokensIn = 0
  let tokensOut = 0
  let costUsd = 0
  let modelUsed = cachedItems.length > 0 ? "cached" : "rule-based"
  let usedLlm = false

  if (pendingItems.length > 0 && !params.skipLlm) {
    const questionIds = [...new Set(pendingItems.map((i) => i.question_id))]
    const optionsByQ = await loadOptionsByQuestion(questionIds)

    const result = await runAgent({
      agentType: params.agentType ?? "report",
      userId: params.userId,
      subjectId: params.subjectId,
      systemPrompt: NOTE_CLARIFICATION_SYSTEM,
      userContent: JSON.stringify(
        itemsToAgentInput(pendingItems, optionsByQ, params.subjectName)
      ),
      jsonMode: true,
      maxTokens: 2000,
      model: "gpt-4o",
      metadata: { phase: "note_clarifications" },
    })

    tokensIn = result.tokensIn
    tokensOut = result.tokensOut
    costUsd = result.costUsd

    if (result.usedLlm && result.text) {
      try {
        const llmClarifications = parseClarificationResponse(
          result.text,
          pendingItems
        )
        if (llmClarifications.length) {
          clarifications.push(...llmClarifications)
          usedLlm = true
          modelUsed = result.model
        }
      } catch {
        /* fall through */
      }
    }

    if (!usedLlm) {
      for (const item of pendingItems) {
        if (clarifications.some((c) => c.question_id === item.question_id)) {
          continue
        }
        clarifications.push({
          question_id: item.question_id,
          note_body: item.note_body,
          answer_md:
            item.cached_feedback?.trim() ||
            "Revise a explicação no relatório do caderno ou regenere as explicações com IA.",
          linked_topics: item.tec_topic ? [item.tec_topic] : [],
        })
      }
    }
  }

  const byQuestionId = new Map<string, string>()
  const dedupedClarifications: SubjectStudyDossierStructured["annotation_clarifications"] =
    []
  const seenQ = new Set<string>()
  for (const c of clarifications) {
    if (!c.answer_md?.trim()) continue
    const prev = byQuestionId.get(c.question_id)
    if (!prev || c.answer_md.length > prev.length) {
      byQuestionId.set(c.question_id, c.answer_md.trim())
    }
    if (!seenQ.has(c.question_id)) {
      dedupedClarifications.push(c)
      seenQ.add(c.question_id)
    } else {
      const idx = dedupedClarifications.findIndex(
        (x) => x.question_id === c.question_id
      )
      if (idx >= 0 && c.answer_md.length > dedupedClarifications[idx]!.answer_md.length) {
        dedupedClarifications[idx] = c
      }
    }
  }

  return {
    clarifications: dedupedClarifications,
    byQuestionId,
    usedLlm,
    modelUsed,
    tokensIn,
    tokensOut,
    costUsd,
  }
}

export function buildDossierClarificationItems(
  annotations: DossierAnnotationInput[],
  payload: { aggregated_errors: { question_id: string; feedback_detailed?: string; error_taxonomy?: string; tec_topic?: string; statement_excerpt?: string }[] }
): NoteClarificationItem[] {
  const errorByQ = new Map(payload.aggregated_errors.map((e) => [e.question_id, e]))
  return annotations
    .filter((a) => a.note_body.trim())
    .map((a) => {
      const err = errorByQ.get(a.question_id)
      return {
        question_id: a.question_id,
        note_body: a.note_body,
        tec_topic: a.tec_topic ?? err?.tec_topic,
        statement_excerpt: a.statement_excerpt ?? err?.statement_excerpt,
        zone: "green_note" as const,
        cached_feedback: a.cached_feedback,
        report_feedback: err?.feedback_detailed?.slice(0, 800),
        error_taxonomy: err?.error_taxonomy,
      }
    })
}

function auditItemPatch(
  item: BehavioralAuditQuestionItem,
  clarification: string | undefined
): BehavioralAuditQuestionItem {
  if (!clarification) return item
  return { ...item, note_clarification: clarification }
}

export function applyClarificationsToAudit(
  audit: BehavioralAudit,
  byQuestionId: Map<string, string>,
  payload: NotebookAuditPayload
): BehavioralAudit {
  const get = (qid: string) => byQuestionId.get(qid)

  const red_zone = audit.red_zone.map((item) =>
    auditItemPatch(item, get(item.question_id))
  )
  const yellow_zone = audit.yellow_zone.map((item) =>
    auditItemPatch(item, get(item.question_id))
  )

  const greenNoteQs = filterGreenNoteQuestions(payload.questions)
  const note_clarifications: BehavioralAuditQuestionItem[] = greenNoteQs.map(
    (q) => {
      const clarification = get(q.question_id)
      const entries = (q.note_entries ?? []).filter((e) => e.body.trim())
      const noteBody =
        entries.length > 0
          ? combineNoteBodies(entries)
          : q.user_note.trim()
      const primaryEntry = entries[0]

      return {
        question_index: q.question_index,
        question_id: q.question_id,
        note_entry_id: primaryEntry?.id,
        note_body: noteBody || undefined,
        header_label: q.header_label,
        statement_excerpt: q.statement_excerpt.slice(0, 400),
        marked: q.selected_answer,
        answer_key: q.correct_answer,
        user_note: noteBody || undefined,
        outcome_category: q.outcome_category,
        confidence_level: q.confidence_level,
        feedback: "",
        note_clarification: clarification,
        source: "ai_generated" as const,
      }
    }
  )

  return {
    ...audit,
    red_zone,
    yellow_zone,
    green_zone: {
      ...audit.green_zone,
      note_clarifications,
    },
  }
}

export async function persistClarificationsToNoteEntries(
  items: NoteClarificationItem[],
  byQuestionId: Map<string, string>,
  modelUsed: string
) {
  const persistedEntries = new Set<string>()

  for (const item of items) {
    if (!item.note_entry_id) continue
    if (persistedEntries.has(item.note_entry_id)) continue
    const answer = byQuestionId.get(item.question_id)
    if (!answer?.trim()) continue
    await persistExplainOnEntry(
      item.note_entry_id,
      answer,
      item.zone,
      modelUsed
    )
    persistedEntries.add(item.note_entry_id)
  }
}

export async function runNotebookNoteClarifications(params: {
  userId: string
  subjectId: string | null
  payload: NotebookAuditPayload
  audit: BehavioralAudit
  taxonomyByQuestion: Map<string, PerQuestionError>
  skipLlm?: boolean
}): Promise<{
  audit: BehavioralAudit
  result: NoteClarificationsResult
}> {
  const items = buildNotebookClarificationItems(
    params.payload,
    params.taxonomyByQuestion,
    params.audit
  )

  const result = await runNoteClarificationsAgent({
    userId: params.userId,
    subjectId: params.subjectId,
    items,
    subjectName: params.payload.subject_name,
    skipLlm: params.skipLlm,
    agentType: "report",
  })

  await persistClarificationsToNoteEntries(
    items,
    result.byQuestionId,
    result.modelUsed
  )

  const audit = applyClarificationsToAudit(
    params.audit,
    result.byQuestionId,
    params.payload
  )

  return { audit, result }
}
