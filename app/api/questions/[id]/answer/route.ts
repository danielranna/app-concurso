import { NextResponse } from "next/server"
import {
  computeOutcomeCategory,
  loadQuestionForStudy,
  normalizeAnswer,
  parseConfidenceLevel,
  recordAttempt,
} from "@/lib/question-study"

/** Resposta avulsa (fora de caderno/sessão) — alimenta estatísticas e cérebro via tentativas. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: question_id } = await params
  const body = await req.json()
  const {
    user_id,
    selected_answer,
    duration_ms,
    confidence_level,
  } = body as {
    user_id: string
    selected_answer: string
    duration_ms?: number | null
    confidence_level?: string
  }

  if (!user_id || !selected_answer) {
    return NextResponse.json(
      { error: "user_id e selected_answer obrigatórios" },
      { status: 400 }
    )
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
    notebook_id: null,
    study_session_id: null,
    selected_answer,
    is_correct,
    duration_ms: duration_ms ?? null,
    confidence_level: confidence,
  })

  const outcome_category = computeOutcomeCategory(confidence, is_correct)

  return NextResponse.json({
    is_correct,
    correct_answer: question.correct_answer,
    tec_url: question.tec_url,
    tec_id: question.tec_id,
    outcome_category,
    confidence_level: confidence,
  })
}
