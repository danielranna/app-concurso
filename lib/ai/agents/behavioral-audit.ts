import type {
  BehavioralAudit,
  BehavioralAuditQuestionItem,
  FeedbackSource,
  PerQuestionError,
} from "../../coach-types"
import { runAgent } from "../run-agent"
import { countReportLlmRunsToday } from "../report-helpers"
import { getEffectiveReportPreferences } from "../context-builder"
import {
  buildNotebookAuditPayload,
  type NotebookAuditPayload,
  type NotebookAuditQuestion,
} from "../notebook-audit-payload"
import { supabaseServer } from "../../supabase-server"
import { mergeUnifiedExplainIntoErrors } from "../merge-unified-errors"
import { UNIFIED_EXPLAIN_SYSTEM_PROMPT } from "../prompts/unified-explain-prompt"
import { loadOptionsByQuestion } from "../question-options"
import {
  buildExplainLlmItem,
  buildFallbackAuditItem,
  filterGreenNoteQuestions,
} from "../behavioral-audit-helpers"

function parseSource(raw: string | undefined): FeedbackSource {
  if (raw === "material" || raw === "mixed" || raw === "ai_generated") return raw
  return "ai_generated"
}

/** @deprecated Use mergeUnifiedExplainIntoErrors */
export const mergeBehavioralAuditIntoErrors = mergeUnifiedExplainIntoErrors
export { mergeUnifiedExplainIntoErrors }

export async function persistAuditInsightsToAttempts(
  audit: BehavioralAudit,
  payload: NotebookAuditPayload
): Promise<void> {
  const items = [
    ...audit.red_zone,
    ...audit.yellow_zone,
    ...(audit.green_zone.note_clarifications ?? []),
  ]

  for (const item of items) {
    const q = payload.questions.find((x) => x.question_id === item.question_id)
    if (!q?.attempt_id) continue

    const { data: existing } = await supabaseServer
      .from("question_attempts")
      .select("error_detail")
      .eq("id", q.attempt_id)
      .maybeSingle()

    const prev = (existing?.error_detail as Record<string, unknown>) ?? {}

    await supabaseServer
      .from("question_attempts")
      .update({
        error_detail: {
          ...prev,
          misconception: item.misconception,
          specific_mistake: item.misconception ?? prev.specific_mistake,
          feedback_detailed: item.feedback,
          feedback_source: item.source,
          explanation_citations: item.citations,
          unified_explain: true,
        },
      })
      .eq("id", q.attempt_id)
  }
}

export type RunBehavioralAuditResult = {
  audit: BehavioralAudit
  modelUsed: string
  usedLlm: boolean
  tokensIn: number
  tokensOut: number
  costUsd: number
}

type LlmZoneItem = {
  question_index: number
  feedback: string
  misconception?: string
  error_taxonomy?: string
  source?: string
}

function buildBaseAudit(
  payload: NotebookAuditPayload,
  optionsByQ: Map<string, { label: string; text: string }[]>,
  taxHint: (qid: string) => PerQuestionError["error_taxonomy"] | undefined
): BehavioralAudit {
  const redQs = payload.questions.filter((q) => q.zone === "red")
  const yellowQs = payload.questions.filter((q) => q.zone === "yellow")
  const greenQs = payload.questions.filter((q) => q.zone === "green")
  const greenNoteQs = filterGreenNoteQuestions(payload.questions)

  return {
    performance_summary: payload.performance_summary,
    red_zone: redQs.map((q) =>
      buildFallbackAuditItem(
        q,
        optionsByQ.get(q.question_id) ?? [],
        "red_yellow",
        taxHint(q.question_id)
      )
    ),
    yellow_zone: yellowQs.map((q) =>
      buildFallbackAuditItem(
        q,
        optionsByQ.get(q.question_id) ?? [],
        "red_yellow",
        taxHint(q.question_id)
      )
    ),
    green_zone: {
      mastered_indexes: greenQs.map((q) => q.question_index),
      theory_balance:
        greenQs.length > 0
          ? `Questões dominadas: ${greenQs.map((q) => `Q${q.question_index}`).join(", ")}.`
          : "Nenhuma questão na zona verde neste caderno.",
      note_clarifications: greenNoteQs.map((q) =>
        buildFallbackAuditItem(
          q,
          optionsByQ.get(q.question_id) ?? [],
          "green_note_only"
        )
      ),
    },
    generated_at: new Date().toISOString(),
    model_used: "rule-based",
  }
}

function mapZoneItems(
  raw: LlmZoneItem[] | undefined,
  sourceQs: NotebookAuditQuestion[],
  optionsByQ: Map<string, { label: string; text: string }[]>,
  mode: "red_yellow" | "green_note_only",
  taxHint: (qid: string) => PerQuestionError["error_taxonomy"] | undefined
): BehavioralAuditQuestionItem[] {
  const byIndex = new Map((raw ?? []).map((r) => [r.question_index, r]))

  return sourceQs.map((q) => {
    const llm = byIndex.get(q.question_index)
    const fallback = buildFallbackAuditItem(
      q,
      optionsByQ.get(q.question_id) ?? [],
      mode,
      taxHint(q.question_id)
    )
    if (!llm) return fallback

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
      feedback: llm.feedback?.trim() || fallback.feedback,
      misconception: llm.misconception,
      error_taxonomy:
        mode === "red_yellow"
          ? taxHint(q.question_id) ?? fallback.error_taxonomy
          : undefined,
      source: parseSource(llm.source),
    }
  })
}

export async function runBehavioralAuditAgent(params: {
  userId: string
  subjectId: string | null
  payload: NotebookAuditPayload
  skipLlm?: boolean
  taxonomyByQuestion?: Map<string, PerQuestionError>
}): Promise<RunBehavioralAuditResult> {
  const taxHint = (qid: string) =>
    params.taxonomyByQuestion?.get(qid)?.error_taxonomy
  const perQ = (qid: string) => params.taxonomyByQuestion?.get(qid)

  const redQs = params.payload.questions.filter((q) => q.zone === "red")
  const yellowQs = params.payload.questions.filter((q) => q.zone === "yellow")
  const greenQs = params.payload.questions.filter((q) => q.zone === "green")
  const greenNoteQs = filterGreenNoteQuestions(params.payload.questions)
  const explainQs = [...redQs, ...yellowQs]

  const explainIds = [
    ...new Set([
      ...explainQs.map((q) => q.question_id),
      ...greenNoteQs.map((q) => q.question_id),
    ]),
  ]
  const optionsByQ = await loadOptionsByQuestion(explainIds)

  const baseAudit = buildBaseAudit(params.payload, optionsByQ, taxHint)

  const nothingToExplain = explainQs.length === 0 && greenNoteQs.length === 0

  if (params.skipLlm || nothingToExplain) {
    return {
      audit: baseAudit,
      modelUsed: "rule-based",
      usedLlm: false,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    }
  }

  const prefs = await getEffectiveReportPreferences(params.userId, params.subjectId)
  const reportsToday = await countReportLlmRunsToday(params.userId)
  if (reportsToday >= prefs.max_llm_explanations_per_day) {
    return {
      audit: baseAudit,
      modelUsed: "rule-based",
      usedLlm: false,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    }
  }

  const input = {
    notebook_name: params.payload.notebook_name,
    subject_name: params.payload.subject_name,
    performance_summary: params.payload.performance_summary,
    red_zone: redQs.map((q) =>
      buildExplainLlmItem(
        q,
        optionsByQ.get(q.question_id) ?? [],
        perQ(q.question_id),
        "red_yellow"
      )
    ),
    yellow_zone: yellowQs.map((q) =>
      buildExplainLlmItem(
        q,
        optionsByQ.get(q.question_id) ?? [],
        perQ(q.question_id),
        "red_yellow"
      )
    ),
    green_note_zone: greenNoteQs.map((q) =>
      buildExplainLlmItem(
        q,
        optionsByQ.get(q.question_id) ?? [],
        undefined,
        "green_note_only"
      )
    ),
    green_zone_summary: greenQs.map((q) => ({
      question_index: q.question_index,
      tec_topic: q.tec_topic,
    })),
  }

  const result = await runAgent({
    agentType: "report",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: UNIFIED_EXPLAIN_SYSTEM_PROMPT,
    userContent: `Explicação unificada (auditoria):\n${JSON.stringify(input)}`,
    jsonMode: true,
    maxTokens: 8000,
    model: "gpt-4o",
    metadata: {
      notebook_id: params.payload.notebook_id,
      phase: "unified_explain",
    },
  })

  if (!result.usedLlm || !result.text) {
    return {
      audit: baseAudit,
      modelUsed: "rule-based",
      usedLlm: false,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    }
  }

  try {
    const parsed = JSON.parse(result.text) as {
      red_zone?: LlmZoneItem[]
      yellow_zone?: LlmZoneItem[]
      green_note_zone?: LlmZoneItem[]
      green_zone?: { mastered_indexes?: number[]; theory_balance?: string }
    }

    const indexToQuestion = new Map(
      params.payload.questions.map((q) => [q.question_index, q])
    )

    const greenIndexes =
      parsed.green_zone?.mastered_indexes ??
      greenQs.map((q) => q.question_index)

    const audit: BehavioralAudit = {
      performance_summary: params.payload.performance_summary,
      red_zone: mapZoneItems(
        parsed.red_zone,
        redQs,
        optionsByQ,
        "red_yellow",
        taxHint
      ),
      yellow_zone: mapZoneItems(
        parsed.yellow_zone,
        yellowQs,
        optionsByQ,
        "red_yellow",
        taxHint
      ),
      green_zone: {
        mastered_indexes: greenIndexes.filter((i) => indexToQuestion.has(i)),
        theory_balance:
          parsed.green_zone?.theory_balance?.trim() ||
          baseAudit.green_zone.theory_balance,
        note_clarifications: mapZoneItems(
          parsed.green_note_zone,
          greenNoteQs,
          optionsByQ,
          "green_note_only",
          taxHint
        ),
      },
      model_used: result.model,
      generated_at: new Date().toISOString(),
    }

    return {
      audit,
      modelUsed: result.model,
      usedLlm: true,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    }
  } catch {
    return {
      audit: baseAudit,
      modelUsed: "rule-based",
      usedLlm: false,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    }
  }
}

export async function runBehavioralAuditForNotebook(
  notebookId: string,
  userId: string,
  subjectId: string | null,
  options?: {
    skipLlm?: boolean
    payload?: NotebookAuditPayload
    taxonomyByQuestion?: Map<string, PerQuestionError>
  }
): Promise<RunBehavioralAuditResult & { payload: NotebookAuditPayload }> {
  const payload =
    options?.payload ?? (await buildNotebookAuditPayload(notebookId, userId))
  const result = await runBehavioralAuditAgent({
    userId,
    subjectId,
    payload,
    skipLlm: options?.skipLlm,
    taxonomyByQuestion: options?.taxonomyByQuestion,
  })
  await persistAuditInsightsToAttempts(result.audit, payload)
  return { ...result, payload }
}

export {
  buildExplainLlmItem,
  buildFallbackAuditItem,
  buildFallbackFeedback,
  filterGreenNoteQuestions,
} from "../behavioral-audit-helpers"
