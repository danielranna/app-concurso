import { supabaseServer } from "../supabase-server"
import type { ConfidenceLevel } from "../question-types"
import { parseConfidenceLevel } from "../question-study"
import {
  insertQuestionNote,
  loadNoteEntriesByQuestion,
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
import { maybePushNotebookAnswer, parseCadernoId } from "../quiz-sync"
import { splitPublishParts } from "./whatsapp-comment"
import type { BehavioralAudit } from "../coach-types"

const QUESTION_AI_TIMEOUT_MS = 50_000
const LATE_AI_POLL_MS = 3_000
const LATE_AI_POLL_TRIES = 4
const WHATSAPP_PUSHED_KEY = "whatsapp_pushed_at"
const WHATSAPP_AI_PUSHED_KEY = "whatsapp_ai_pushed_at"

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
  shortId?: string | null
  cadernoId?: number | null
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

async function isAiPushed(attemptId: string): Promise<boolean> {
  const detail = await readErrorDetail(attemptId)
  return Boolean(detail[WHATSAPP_AI_PUSHED_KEY])
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

async function markAiPushed(attemptId: string) {
  const prev = await readErrorDetail(attemptId)
  if (prev[WHATSAPP_AI_PUSHED_KEY]) return
  await supabaseServer
    .from("question_attempts")
    .update({
      error_detail: {
        ...prev,
        [WHATSAPP_AI_PUSHED_KEY]: new Date().toISOString(),
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

function hasRealNoteBody(body: string | null | undefined): boolean {
  return (body?.trim().length ?? 0) > 0
}

async function questionHasPublishableNotes(
  userId: string,
  questionId: string,
  noteEntryIds: string[]
): Promise<boolean> {
  const map = await loadNoteEntriesByQuestion(userId, [questionId])
  const entries = map.get(questionId) ?? []
  const pool = noteEntryIds.length
    ? entries.filter((e) => noteEntryIds.includes(e.id))
    : entries
  const source = pool.length ? pool : entries
  return source.some((e) => hasRealNoteBody(e.body))
}

async function buildPublishParts(
  userId: string,
  questionId: string,
  noteEntryIds: string[]
): Promise<{ comment: string | null; aiComment: string | null }> {
  const map = await loadNoteEntriesByQuestion(userId, [questionId])
  const entries = map.get(questionId) ?? []
  const target = noteEntryIds.length
    ? entries.filter((e) => noteEntryIds.includes(e.id))
    : entries
  const withBody = (target.length ? target : entries).filter((e) =>
    hasRealNoteBody(e.body)
  )
  if (!withBody.length) return { comment: null, aiComment: null }
  const note = combineNoteBodies(withBody)
  const ai =
    withBody
      .map((e) => e.ai_feedback?.trim())
      .filter((t) => hasRealNoteBody(t))
      .sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))[0] ?? null
  return splitPublishParts(note, ai)
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
  aiComment?: string | null
  aiUpdate?: boolean
  shortId?: string | null
  cadernoId?: number | null
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
      aiComment: input.aiComment,
      aiUpdate: input.aiUpdate,
      tags: input.tags,
      shortId: input.shortId,
      cadernoId: input.cadernoId,
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
    aiComment: input.aiComment,
    aiUpdate: input.aiUpdate,
    tags: input.tags,
    shortId: input.shortId,
    cadernoId: input.cadernoId,
  })
}

function stubAudit(): BehavioralAudit {
  return {
    performance_summary: {
      correct: 0,
      total: 0,
      pct: 0,
      groups: { red: 0, yellow: 0, green: 0 },
    },
    red_zone: [],
    yellow_zone: [],
    green_zone: { mastered_indexes: [], theory_balance: "" },
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runNoteReplyPipeline(input: {
  userId: string
  attemptId: string
  notebookId: string | null
}) {
  const payload = await buildAttemptAuditPayload(input.userId, input.attemptId)
  const subjectId = await loadSubjectId(input.notebookId)
  const { result: clarifyResult } = await runNotebookNoteClarifications({
    userId: input.userId,
    subjectId,
    payload,
    audit: stubAudit(),
    taxonomyByQuestion: new Map(),
    skipLlm: false,
    agentType: "question_explain",
  })
  return {
    usedLlm: clarifyResult.usedLlm,
    modelUsed: clarifyResult.modelUsed,
    payload,
    subjectId,
  }
}

async function runAuditExtrasPipeline(input: {
  userId: string
  notebookId: string | null
  payload: Awaited<ReturnType<typeof buildAttemptAuditPayload>>
  subjectId: string | null
}) {
  const zone = input.payload.questions[0]?.zone
  let taxonomyByQuestion = new Map()
  if (zone === "red" || zone === "yellow") {
    const classified = await classifyNotebookQuestions(
      input.userId,
      input.payload.notebook_id,
      input.subjectId,
      input.payload,
      { skipLlm: false, agentType: "question_explain" }
    )
    taxonomyByQuestion = classified.byQuestionId
  }

  const auditResult = await runBehavioralAuditAgent({
    userId: input.userId,
    subjectId: input.subjectId,
    payload: input.payload,
    skipLlm: false,
    taxonomyByQuestion,
    ignoreDailyCap: true,
    agentType: "question_explain",
  })
  await persistAuditInsightsToAttempts(auditResult.audit, input.payload)
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
  const shortId =
    typeof payload.short_id === "string" ? payload.short_id : null
  const cadernoId = parseCadernoId(payload.caderno_id)

  if (!questionId || !attemptId) {
    throw new Error("question_id e attempt_id obrigatórios")
  }

  const alreadyPushed = await isWhatsappPushed(attemptId)
  const alreadyAiPushed = await isAiPushed(attemptId)
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
    shortId,
    cadernoId,
  }

  if (pushWhatsapp && !alreadyPushed) {
    const immediate = hasNotes
      ? await buildPublishParts(userId, questionId, noteEntryIds)
      : { comment: null, aiComment: null }
    await pushAttemptToWhatsapp({
      ...pushArgs,
      comment: immediate.comment,
      aiComment: null,
    })
    await markWhatsappPushed(attemptId)
  }

  let usedLlm = false
  let modelUsed = "rule-based"
  let timedOut = false
  let auditPayload: Awaited<ReturnType<typeof buildAttemptAuditPayload>> | null =
    null
  let auditSubjectId: string | null = null
  try {
    const result = await withTimeout(
      runNoteReplyPipeline({ userId, attemptId, notebookId }),
      QUESTION_AI_TIMEOUT_MS
    )
    usedLlm = result.usedLlm
    modelUsed = result.modelUsed
    auditPayload = result.payload
    auditSubjectId = result.subjectId
  } catch (e) {
    timedOut = e instanceof Error && e.message === "question_ai_timeout"
    if (!timedOut) {
      console.warn(
        "[question-resolve-ai] note reply:",
        e instanceof Error ? e.message : e
      )
    }
  }

  let parts = hasNotes
    ? await buildPublishParts(userId, questionId, noteEntryIds)
    : { comment: null, aiComment: null }

  if (hasNotes && !parts.aiComment) {
    for (let i = 0; i < LATE_AI_POLL_TRIES; i++) {
      await sleep(LATE_AI_POLL_MS)
      parts = await buildPublishParts(userId, questionId, noteEntryIds)
      if (parts.aiComment) break
    }
  }

  if (hasNotes && !alreadyAiPushed && parts.aiComment) {
    await pushAttemptToWhatsapp({
      ...pushArgs,
      comment: null,
      aiComment: parts.aiComment,
      aiUpdate: true,
    })
    await markAiPushed(attemptId)
  }

  if (auditPayload) {
    try {
      await runAuditExtrasPipeline({
        userId,
        notebookId,
        payload: auditPayload,
        subjectId: auditSubjectId,
      })
    } catch (e) {
      console.warn(
        "[question-resolve-ai] audit extras:",
        e instanceof Error ? e.message : e
      )
    }
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
        short_id: input.shortId ?? null,
        caderno_id: input.cadernoId ?? null,
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
