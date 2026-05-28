import { supabaseServer } from "../supabase-server"
import type { ErrorTaxonomy, PerQuestionError } from "../coach-types"
import { findTopicEntry } from "./brain-helpers"
import { loadSubjectBrain } from "./context-builder"
import { runAgent } from "./run-agent"
import { fetchIncidenceRows, resolveSubjectLabels } from "../incidence-rows-db"
import {
  buildIncidenceTopicIndex,
  computeErrorPriorityScore,
  getActiveExamTargetId,
  getEditalWeightForSubject,
  matchTopicToIncidence,
} from "../strategic-weights"
import {
  ERROR_TAXONOMY_CLASSIFY_PROMPT,
  ERROR_TAXONOMY_IDS,
} from "./error-taxonomy-rubric"
import {
  buildNotebookAuditPayload,
  type NotebookAuditPayload,
  type NotebookAuditQuestion,
} from "./notebook-audit-payload"
import type {
  ClassificationResult,
  ClassificationSource,
  WrongAttemptRow,
} from "./error-classifier-types"
import { heuristicClassify, TAXONOMY_SEVERITY } from "./error-taxonomy-heuristic"

export type {
  ClassificationResult,
  ClassificationSource,
  WrongAttemptRow,
} from "./error-classifier-types"
export { heuristicClassify } from "./error-taxonomy-heuristic"

export const VALID_TAXONOMIES = new Set<string>(ERROR_TAXONOMY_IDS)

function parseTaxonomy(raw: string | undefined): ErrorTaxonomy | null {
  if (!raw || !VALID_TAXONOMIES.has(raw)) return null
  return raw as ErrorTaxonomy
}

async function loadWeightContext(userId: string, subjectId: string | null) {
  const examId = await getActiveExamTargetId(userId)
  if (!examId || !subjectId) {
    return { examId: null as string | null, editalWeight: 1, topicIndex: buildIncidenceTopicIndex([]) }
  }

  const [editalWeight, labels] = await Promise.all([
    getEditalWeightForSubject(userId, examId, subjectId),
    resolveSubjectLabels(userId, examId, subjectId).catch(() => [] as string[]),
  ])

  const rows =
    labels.length > 0
      ? await fetchIncidenceRows({
          userId,
          examTargetId: examId,
          subjectLabels: labels,
        })
      : []

  const topicIndex = buildIncidenceTopicIndex(
    (rows ?? []).map((r) => ({
      topic_name: String(r.topic_name),
      percent: Number(r.percent),
      is_subtopic: Boolean(r.is_subtopic),
    }))
  )

  return { examId, editalWeight, topicIndex }
}

async function loadOptionsByQuestion(
  questionIds: string[]
): Promise<Map<string, { label: string; text: string }[]>> {
  const map = new Map<string, { label: string; text: string }[]>()
  if (!questionIds.length) return map

  const { data } = await supabaseServer
    .from("question_options")
    .select("question_id, label, text, sort_order")
    .in("question_id", questionIds)
    .order("sort_order", { ascending: true })

  for (const o of data ?? []) {
    const list = map.get(o.question_id) ?? []
    list.push({ label: String(o.label), text: String(o.text ?? "").slice(0, 200) })
    map.set(o.question_id, list)
  }
  return map
}

async function loadPriorCorrectCounts(
  userId: string,
  notebookId: string,
  questionIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  await Promise.all(
    questionIds.map(async (qid) => {
      const { count } = await supabaseServer
        .from("question_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("question_id", qid)
        .eq("is_correct", true)
        .neq("notebook_id", notebookId)
      map.set(qid, count ?? 0)
    })
  )
  return map
}

export function auditQuestionToRow(
  q: NotebookAuditQuestion,
  extras: {
    prior_correct_count: number
    options: { label: string; text: string }[]
    priority_score?: number
  }
): WrongAttemptRow {
  return {
    attempt_id: q.attempt_id ?? "",
    question_id: q.question_id,
    duration_ms: q.duration_ms,
    outcome_category: q.outcome_category,
    confidence_level: q.confidence_level,
    is_correct: q.is_correct,
    zone: q.zone,
    selected_answer: q.selected_answer,
    correct_answer: q.correct_answer,
    tec_id: q.tec_id,
    tec_topic: q.tec_topic,
    statement: q.statement,
    banca: q.banca,
    ano: q.ano,
    orgao: q.orgao,
    user_note: q.user_note,
    notes: q.user_note ? [q.user_note] : [],
    prior_correct_count: extras.prior_correct_count,
    priority_score: extras.priority_score ?? 0,
    options: extras.options,
  }
}

export function buildClassificationInput(
  payload: NotebookAuditPayload,
  rows: WrongAttemptRow[]
) {
  const target = payload.questions.filter((q) => q.zone === "red" || q.zone === "yellow")
  const rowByQ = new Map(rows.map((r) => [r.question_id, r]))

  return {
    notebook_id: payload.notebook_id,
    notebook_name: payload.notebook_name,
    subject_name: payload.subject_name,
    questions: target.map((q) => {
      const row = rowByQ.get(q.question_id)
      return {
        question_id: q.question_id,
        question_index: q.question_index,
        zone: q.zone,
        is_correct: q.is_correct,
        tec_topic: q.tec_topic,
        statement_excerpt: q.statement_excerpt.slice(0, 900),
        options: row?.options ?? [],
        marked: q.selected_answer,
        answer_key: q.correct_answer,
        user_note: q.user_note || null,
        outcome_category: q.outcome_category,
        confidence_level: q.confidence_level,
        duration_ms: q.duration_ms,
        prior_correct_count: row?.prior_correct_count ?? 0,
      }
    }),
  }
}

export async function buildRowsForAuditPayload(
  userId: string,
  notebookId: string,
  subjectId: string | null,
  payload: NotebookAuditPayload
): Promise<WrongAttemptRow[]> {
  const target = payload.questions.filter((q) => q.zone === "red" || q.zone === "yellow")
  const questionIds = target.map((q) => q.question_id)
  const [optionsByQ, priorByQ, weights, brain] = await Promise.all([
    loadOptionsByQuestion(questionIds),
    loadPriorCorrectCounts(userId, notebookId, questionIds),
    loadWeightContext(userId, subjectId),
    subjectId ? loadSubjectBrain(userId, subjectId) : Promise.resolve(null),
  ])

  const rows: WrongAttemptRow[] = []

  for (const q of target) {
    const topic = q.tec_topic?.trim() || "Sem tópico"
    const entry = brain?.topic_map ? findTopicEntry(brain.topic_map, topic) : null
    const brainGap = entry?.[1] ? 1 - entry[1].dominio : 0.5
    const incidenceMatch = matchTopicToIncidence(topic, weights.topicIndex)
    const { taxonomy } = heuristicClassify(
      auditQuestionToRow(q, {
        prior_correct_count: priorByQ.get(q.question_id) ?? 0,
        options: optionsByQ.get(q.question_id) ?? [],
      })
    )

    const priority_score = computeErrorPriorityScore({
      wrongCount: q.is_correct ? 0 : 1,
      incidenceWeight: incidenceMatch.weight,
      editalWeight: weights.editalWeight,
      brainGap,
      taxonomySeverity: TAXONOMY_SEVERITY[taxonomy],
    })

    const row = auditQuestionToRow(q, {
      prior_correct_count: priorByQ.get(q.question_id) ?? 0,
      options: optionsByQ.get(q.question_id) ?? [],
      priority_score,
    })
    row.incidence_weight = incidenceMatch.weight
    row.edital_weight = weights.editalWeight
    row.matched_incidence_topic = incidenceMatch.matchedTopic
    rows.push(row)
  }

  return rows.sort((a, b) => b.priority_score - a.priority_score)
}

function rowToPerQuestionError(
  row: WrongAttemptRow,
  q: NotebookAuditQuestion,
  classified: ClassificationResult,
  brainStatus?: string
): PerQuestionError {
  return {
    question_id: row.question_id,
    attempt_id: row.attempt_id || undefined,
    tec_id: row.tec_id,
    tec_topic: row.tec_topic,
    error_taxonomy: classified.taxonomy,
    priority_score: row.priority_score,
    specific_mistake: classified.specific_mistake,
    evidence: classified.evidence,
    brain_topic_status: brainStatus,
    marked_answer: row.selected_answer,
    correct_answer: row.correct_answer,
    user_note: row.user_note || undefined,
    statement_excerpt: row.statement.slice(0, 400),
    outcome_category: row.outcome_category ?? undefined,
    confidence_level: row.confidence_level ?? undefined,
    zone: q.zone,
    question_index: q.question_index,
    header_label: q.header_label,
    classification_source: classified.source,
  }
}

export type ClassifyNotebookResult = {
  items: PerQuestionError[]
  byQuestionId: Map<string, PerQuestionError>
  usedLlm: boolean
  modelUsed: string
  tokensIn: number
  tokensOut: number
  costUsd: number
}

export async function classifyNotebookQuestions(
  userId: string,
  notebookId: string,
  subjectId: string | null,
  payload: NotebookAuditPayload,
  options?: { skipLlm?: boolean }
): Promise<ClassifyNotebookResult> {
  const rows = await buildRowsForAuditPayload(userId, notebookId, subjectId, payload)
  const qById = new Map(payload.questions.map((q) => [q.question_id, q]))
  const brain = subjectId ? await loadSubjectBrain(userId, subjectId) : null

  const heuristicByQ = new Map<string, ClassificationResult>()
  for (const row of rows) {
    heuristicByQ.set(row.question_id, heuristicClassify(row))
  }

  let llmByQ = new Map<string, ClassificationResult>()
  let usedLlm = false
  let modelUsed = "heuristic"
  let tokensIn = 0
  let tokensOut = 0
  let costUsd = 0

  if (!options?.skipLlm && rows.length > 0) {
    const input = buildClassificationInput(payload, rows)
    const result = await runAgent({
      agentType: "report",
      userId,
      subjectId,
      systemPrompt: ERROR_TAXONOMY_CLASSIFY_PROMPT,
      userContent: JSON.stringify(input),
      jsonMode: true,
      maxTokens: 4000,
      model: "gpt-4o",
      metadata: {
        notebook_id: payload.notebook_id,
        phase: "error_classify",
      },
    })

    tokensIn = result.tokensIn
    tokensOut = result.tokensOut
    costUsd = result.costUsd

    if (result.usedLlm && result.text) {
      try {
        const parsed = JSON.parse(result.text) as {
          items?: {
            question_id: string
            error_taxonomy: string
            specific_mistake?: string
            evidence?: string[]
            confidence?: "alta" | "media" | "baixa"
          }[]
        }
        const next = new Map<string, ClassificationResult>()
        for (const item of parsed.items ?? []) {
          const tax = parseTaxonomy(item.error_taxonomy)
          if (!tax) continue
          next.set(item.question_id, {
            taxonomy: tax,
            evidence: (item.evidence ?? []).slice(0, 4),
            specific_mistake: item.specific_mistake?.trim(),
            confidence: item.confidence,
            source: "llm_classify",
          })
        }
        llmByQ = next
        usedLlm = next.size > 0
        modelUsed = result.model
      } catch {
        /* keep heuristics */
      }
    }
  }

  const items: PerQuestionError[] = []

  for (const row of rows) {
    const q = qById.get(row.question_id)!
    const classified = llmByQ.get(row.question_id) ?? heuristicByQ.get(row.question_id)!
    const brainFound = brain?.topic_map ? findTopicEntry(brain.topic_map, row.tec_topic) : null

    const errorDetail = {
      specific_mistake: classified.specific_mistake,
      evidence: classified.evidence,
      source: classified.source,
      classification_confidence: classified.confidence,
      priority_score: row.priority_score,
      incidence_weight: row.incidence_weight,
      edital_weight: row.edital_weight,
      matched_incidence_topic: row.matched_incidence_topic,
      brain_topic_status: brainFound?.[1]?.status,
    }

    if (row.attempt_id) {
      await supabaseServer
        .from("question_attempts")
        .update({
          error_taxonomy: classified.taxonomy,
          error_detail: errorDetail,
        })
        .eq("id", row.attempt_id)
    }

    items.push(
      rowToPerQuestionError(row, q, classified, brainFound?.[1]?.status)
    )
  }

  const byQuestionId = new Map(items.map((i) => [i.question_id, i]))

  return {
    items,
    byQuestionId,
    usedLlm,
    modelUsed,
    tokensIn,
    tokensOut,
    costUsd,
  }
}

export async function classifyNotebookErrorsWithLlm(
  userId: string,
  notebookId: string,
  subjectId: string | null,
  options?: { skipLlm?: boolean }
): Promise<ClassifyNotebookResult> {
  const payload = await buildNotebookAuditPayload(notebookId, userId)
  return classifyNotebookQuestions(userId, notebookId, subjectId, payload, options)
}

export async function fetchWrongAttemptsForNotebook(
  userId: string,
  notebookId: string,
  subjectId: string | null
): Promise<WrongAttemptRow[]> {
  const payload = await buildNotebookAuditPayload(notebookId, userId)
  const rows = await buildRowsForAuditPayload(userId, notebookId, subjectId, payload)
  return rows.filter((r) => !r.is_correct)
}

export async function classifyWrongAttempts(
  userId: string,
  notebookId: string,
  subjectId: string | null,
  options?: { skipLlm?: boolean }
): Promise<PerQuestionError[]> {
  const result = await classifyNotebookErrorsWithLlm(
    userId,
    notebookId,
    subjectId,
    options
  )
  return result.items
}
