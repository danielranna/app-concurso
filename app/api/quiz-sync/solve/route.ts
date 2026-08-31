import { NextResponse } from "next/server"
import {
  computeOutcomeCategory,
  loadQuestionForStudy,
  normalizeAnswer,
  parseConfidenceLevel,
  recordAttempt,
  refreshNotebookProgress,
} from "@/lib/question-study"
import { enqueueQuestionResolveAi } from "@/lib/ai/question-resolve-ai"
import { scheduleQuestionAiKick } from "@/lib/ai/jobs/kick"

export const maxDuration = 120

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const {
    user_id,
    question_id,
    notebook_id,
    selected_answer,
    duration_ms,
    confidence_level,
    tags,
    comment,
    note_draft,
    short_id,
    caderno_id,
  } = body as {
    user_id?: string
    question_id?: string
    notebook_id?: string | null
    selected_answer?: string
    duration_ms?: number | null
    confidence_level?: string
    tags?: string[]
    comment?: string | null
    note_draft?: string | null
    short_id?: string | null
    caderno_id?: number | null
  }

  if (!user_id || !question_id || !selected_answer) {
    return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 })
  }

  const { question } = await loadQuestionForStudy(question_id, user_id)
  if (!question) {
    return NextResponse.json({ error: "Questão não encontrada" }, { status: 404 })
  }

  const is_correct = normalizeAnswer(question.type, selected_answer, question.correct_answer)
  const confidence = parseConfidenceLevel(confidence_level)
  const nb = notebook_id || null

  const { id: attemptId } = await recordAttempt({
    user_id,
    question_id,
    notebook_id: nb,
    study_session_id: null,
    selected_answer,
    is_correct,
    duration_ms: duration_ms ?? null,
    confidence_level: confidence,
    attempt_tags: Array.isArray(tags) ? tags : undefined,
  })

  if (nb) await refreshNotebookProgress(nb, user_id)

  await enqueueQuestionResolveAi({
    userId: user_id,
    questionId: question_id,
    attemptId,
    notebookId: nb,
    noteDraft: String(note_draft ?? comment ?? "").trim() || null,
    selectedAnswer: selected_answer,
    confidenceLevel: confidence,
    durationMs: duration_ms ?? null,
    tags: Array.isArray(tags) ? tags : [],
    pushWhatsapp: true,
    shortId: typeof short_id === "string" ? short_id : null,
    cadernoId:
      caderno_id != null && Number.isFinite(Number(caderno_id)) && Number(caderno_id) > 0
        ? Number(caderno_id)
        : null,
  })
  scheduleQuestionAiKick(user_id)

  return NextResponse.json({
    is_correct,
    correct_answer: question.correct_answer,
    tec_url: question.tec_url,
    confidence_level: confidence,
    outcome_category: computeOutcomeCategory(confidence, is_correct),
  })
}
