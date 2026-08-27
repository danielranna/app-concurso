import { supabaseServer } from "../supabase-server"
import type { ConfidenceLevel } from "../question-types"
import { parseConfidenceLevel } from "../question-study"
import {
  insertQuestionNote,
  loadNoteEntriesByQuestion,
  splitPendingNoteEntries,
} from "../question-notes"
import { combineNoteBodies } from "../note-entry-utils"
import { enqueueJob } from "./jobs/queue"
import { classifyNotebookQuestions } from "./error-classifier"
import {
  persistAuditInsightsToAttempts,
  runBehavioralAuditAgent,
} from "./agents/behavioral-audit"
import { runNotebookNoteClarifications } from "./note-clarifications"
import { buildAttemptAuditPayload } from "./notebook-audit-payload"
import { maybePushNotebookAnswer } from "../quiz-sync"
import { formatWhatsappComment } from "./whatsapp-comment"

const QUESTION_AI_TIMEOUT_MS = 45_000
const WHATSAPP_PUSHED_KEY = "whatsapp_pushed_at"

export type EnqueueQuestionResolveAiInput = {
  userId: string
  questionId: string
  attemptId: string
  notebookId?: string | null
  noteDraft?: string | null
  selectedAnswer: string
  confidenceLevel?: string | null
  durationMs?: number | null
  tags?: string[]
  pushWhatsapp?: boolean
  idempotencyKey?: string
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("question_ai_timeout")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

async function readErrorDetail(
  attemptId: string
): Promise<Record<string, unknown>> {
  const { data } = await supabaseServer
    .from("question_attempts")
    .select("error_detail")
    .eq("id", attemptId)
    .maybeSingle()
  return (data?.error_detail as Record<string, unknown>) ?? {}
}

export async function isWhatsappPushed(attemptId: string): Promise<boolean> {
  const detail = await readErrorDetail(attemptId)
  return Boolean(detail[WHATSAPP_PUSHED_KEY])
}

async function markWhatsappPushed(attemptId: string) {
  const prev = await readErrorDetail(attemptId)
  if (prev[WHATSAPP_PUSHED_KEY]) return
  await supabaseServer
    .from("question_attempts")
    .update({
      error_detail: {
        ...prev,
        [WHATSAPP_PUSHED_KEY]: new Date().toISOString(),
      },
    })
    .eq("id", attemptId)
}

async function loadSubjectId(notebookId: string | null): Promise<string | null> {
  if (!notebookId) return null
  const { data } = await supabaseServer
    .from("notebooks")
    .select("subject_id")
    .eq("id", notebookId)
    .maybeSingle()
  return (data?.subject_id as string | null) ?? null
}

async function questionHasPublishableNotes(
  userId: string,
  questionId: string,
  noteEntryIds: string[]
): Promise<boolean> {
  const map = await loadNoteEntriesByQuestion(userId, [questionId])
  const entries = map.get(questionId) ?? []
  if (noteEntryIds.length) {
    return entries.some((e) => noteEntryIds.includes(e.id) && e.body.trim())
  }
  const { pending } = splitPendingNoteEntries(entries)
  return pending.some((e) => e.body.trim())
}

async function buildPublishComment(
  userId: string,
  questionId: string,
  noteEntryIds: string[]
): Promise<string | null> {
  const map = await loadNoteEntriesByQuestion(userId, [questionId])
  const entries = map.get(questionId) ?? []
  const target = noteEntryIds.length
    ? entries.filter((e) => noteEntryIds.includes(e.id))
    : splitPendingNoteEntries(entries).pending
  const withBody = (target.length ? target : entries).filter((e) => e.body.trim())
  if (!withBody.length) return null
  const note = combineNoteBodies(withBody)
  const ai =
    withBody
      .map((e) => e.ai_feedback?.trim())
      .filter(Boolean)
      .sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))[0] ?? null
  const formatted = formatWhatsappComment(note, ai)
  return formatted || null
}

async function pushAttemptToWhatsapp(input: {
  userId: string
  questionId: string
  notebookId: string | null
  selectedAnswer: string
  confidenceLevel: ConfidenceLevel
  durationMs: number | null
  tags: string[]
  comment: string | null
}) {
  if (!input.notebookId) {
    const { pushAnswerToWhatsapp } = await import("../quiz-sync")
    return pushAnswerToWhatsapp({
      userId: input.userId,
      questionId: input.questionId,
      selectedAnswer: input.selectedAnswer,
      confidenceLevel: input.confidenceLevel,
      durationMs: input.durationMs,
      comment: input.comment,
      tags: input.tags,
    })
  }
  return maybePushNotebookAnswer({
    notebookId: input.notebookId,
    userId: input.userId,
    questionId: input.questionId,
    selectedAnswer: input.selectedAnswer,
    confidenceLevel: input.confidenceLevel,
    durationMs: input.durationMs,
    comment: input.comment,
    tags: input.tags,
  })
}

async function runQuestionAiPipeline(input: {
  userId: string
  attemptId: string
  notebookId: string | null
}) {
  const payload = await buildAttemptAuditPayload(input.userId, input.attemptId)
  const subjectId = await loadSubjectId(input.notebookId)
  const zone = payload.questions[0]?.zone
  const notebookKey = payload.notebook_id

  let taxonomyByQuestion = new Map()
  if (zone === "red" || zone === "yellow") {
    const classified = await classifyNotebookQuestions(
      input.userId,
      notebookKey,
      subjectId,
      payload,
      { skipLlm: false, agentType: "question_explain" }
    )
    taxonomyByQuestion = classified.byQuestionId
  }

  const auditResult = await runBehavioralAuditAgent({
    userId: input.userId,
    subjectId,
    payload,
    skipLlm: false,
    taxonomyByQuestion,
    ignoreDailyCap: true,
    agentType: "question_explain",
  })
  await persistAuditInsightsToAttempts(auditResult.audit, payload)

  const refreshed = await buildAttemptAuditPayload(input.userId, input.attemptId)
  const { result: clarifyResult } = await runNotebookNoteClarifications({
    userId: input.userId,
    subjectId,
    payload: refreshed,
    audit: auditResult.audit,
    taxonomyByQuestion,
    skipLlm: false,
    agentType: "question_explain",
  })

  return {
    usedLlm: auditResult.usedLlm || clarifyResult.usedLlm,
    modelUsed: clarifyResult.usedLlm
      ? clarifyResult.modelUsed
      : auditResult.modelUsed,
  }
}

export async function processQuestionResolveAi(
  userId: string,
  payload: Record<string, unknown>
) {
  const questionId = String(payload.question_id || "")
  const attemptId = String(payload.attempt_id || "")
  const notebookId =
    typeof payload.notebook_id === "string" && payload.notebook_id
      ? payload.notebook_id
      : null
  const noteEntryIds = Array.isArray(payload.note_entry_ids)
    ? payload.note_entry_ids.filter((id): id is string => typeof id === "string")
    : []
  const pushWhatsapp = payload.push_whatsapp !== false
  const selectedAnswer = String(payload.selected_answer || "")
  const confidenceLevel = parseConfidenceLevel(payload.confidence_level)
  const durationMs =
    payload.duration_ms == null ? null : Number(payload.duration_ms)
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((t): t is string => typeof t === "string")
    : []

  if (!questionId || !attemptId) {
    throw new Error("question_id e attempt_id obrigatórios")
  }

  const alreadyPushed = await isWhatsappPushed(attemptId)
  const hasNotes = await questionHasPublishableNotes(
    userId,
    questionId,
    noteEntryIds
  )

  const pushArgs = {
    userId,
    questionId,
    notebookId,
    selectedAnswer,
    confidenceLevel,
    durationMs,
    tags,
  }

  if (pushWhatsapp && !alreadyPushed && !hasNotes) {
    await pushAttemptToWhatsapp({ ...pushArgs, comment: null })
    await markWhatsappPushed(attemptId)
  }

  let usedLlm = false
  let modelUsed = "rule-based"
  let timedOut = false
  try {
    const result = await withTimeout(
      runQuestionAiPipeline({ userId, attemptId, notebookId }),
      QUESTION_AI_TIMEOUT_MS
    )
    usedLlm = result.usedLlm
    modelUsed = result.modelUsed
  } catch (e) {
    timedOut = e instanceof Error && e.message === "question_ai_timeout"
    if (!timedOut) {
      console.warn(
        "[question-resolve-ai] pipeline:",
        e instanceof Error ? e.message : e
      )
    }
  }

  if (pushWhatsapp && !alreadyPushed && hasNotes) {
    const comment = await buildPublishComment(userId, questionId, noteEntryIds)
    await pushAttemptToWhatsapp({ ...pushArgs, comment })
    await markWhatsappPushed(attemptId)
  }

  return {
    used_llm: usedLlm,
    model_used: modelUsed,
    timed_out: timedOut,
    pushed: pushWhatsapp && !alreadyPushed,
    had_notes: hasNotes,
  }
}

export async function enqueueQuestionResolveAi(input: EnqueueQuestionResolveAiInput) {
  const noteEntryIds: string[] = []
  const draft = input.noteDraft?.trim()
  if (draft) {
    try {
      const entry = await insertQuestionNote(
        input.userId,
        input.questionId,
        draft
      )
      noteEntryIds.push(entry.id)
    } catch (e) {
      console.warn(
        "[question-resolve-ai] note draft:",
        e instanceof Error ? e.message : e
      )
    }
  }

  try {
    await enqueueJob({
      userId: input.userId,
      jobType: "question_resolve_ai",
      idempotencyKey:
        input.idempotencyKey ?? `question_ai:${input.attemptId}`,
      payload: {
        question_id: input.questionId,
        attempt_id: input.attemptId,
        notebook_id: input.notebookId ?? null,
        note_entry_ids: noteEntryIds,
        selected_answer: input.selectedAnswer,
        confidence_level: input.confidenceLevel ?? "seguro",
        duration_ms: input.durationMs ?? null,
        tags: input.tags ?? [],
        push_whatsapp: input.pushWhatsapp !== false,
      },
      priority: 20,
    })
  } catch (e) {
    console.warn(
      "[question-resolve-ai] enqueue:",
      e instanceof Error ? e.message : e
    )
  }

  return { noteEntryIds }
}
