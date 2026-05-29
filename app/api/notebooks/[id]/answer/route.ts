import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  computeOutcomeCategory,
  loadQuestionForStudy,
  normalizeAnswer,
  parseConfidenceLevel,
  recordAttempt,
  refreshNotebookProgress,
} from "@/lib/question-study"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebook_id } = await params
  const body = await req.json()
  const { user_id, question_id, selected_answer, duration_ms, confidence_level } = body

  if (!user_id || !question_id || !selected_answer) {
    return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 })
  }

  const { question } = await loadQuestionForStudy(question_id, user_id)
  if (!question) {
    return NextResponse.json({ error: "Questão não encontrada" }, { status: 404 })
  }

  const is_correct = normalizeAnswer(
    question.type,
    selected_answer,
    question.correct_answer
  )

  const confidence = parseConfidenceLevel(confidence_level)
  await recordAttempt({
    user_id,
    question_id,
    notebook_id,
    study_session_id: null,
    selected_answer,
    is_correct,
    duration_ms: duration_ms ?? null,
    confidence_level: confidence,
  })

  await refreshNotebookProgress(notebook_id, user_id)

  return NextResponse.json({
    is_correct,
    correct_answer: question.correct_answer,
    tec_url: question.tec_url,
    confidence_level: confidence,
    outcome_category: computeOutcomeCategory(confidence, is_correct),
  })
}
