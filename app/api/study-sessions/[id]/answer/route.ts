import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  computeOutcomeCategory,
  getSessionAnsweredQuestionIds,
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
  const { id: study_session_id } = await params
  const body = await req.json()
  const {
    user_id,
    question_id,
    notebook_id,
    selected_answer,
    duration_ms,
    tec_id,
    confidence_level,
  } = body

  if (!user_id || !question_id || !selected_answer || tec_id == null) {
    return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 })
  }

  const { data: session } = await supabaseServer
    .from("study_sessions")
    .select("*")
    .eq("id", study_session_id)
    .eq("user_id", user_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })
  }

  const answeredQuestions = await getSessionAnsweredQuestionIds(study_session_id, user_id)
  const queue = (session.queue ?? []) as { tec_id: number; question_id: string }[]

  if (answeredQuestions.has(question_id)) {
    const { data: existing } = await supabaseServer
      .from("question_attempts")
      .select("is_correct, confidence_level")
      .eq("study_session_id", study_session_id)
      .eq("user_id", user_id)
      .eq("question_id", question_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { question } = await loadQuestionForStudy(question_id, user_id)
    if (!question) {
      return NextResponse.json({ error: "Questão não encontrada" }, { status: 404 })
    }

    const confidence = parseConfidenceLevel(existing?.confidence_level)
    const is_correct = existing?.is_correct ?? false
    const allDone = answeredQuestions.size >= queue.length

    return NextResponse.json({
      is_correct,
      correct_answer: question.correct_answer,
      tec_url: question.tec_url,
      confidence_level: confidence,
      outcome_category: computeOutcomeCategory(confidence, is_correct),
      session_completed: allDone,
      already_answered: true,
    })
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
    notebook_id: notebook_id ?? null,
    study_session_id,
    selected_answer,
    is_correct,
    duration_ms: duration_ms ?? null,
    confidence_level: confidence,
  })

  if (notebook_id) {
    await refreshNotebookProgress(notebook_id, user_id)

    const { data: snb } = await supabaseServer
      .from("study_session_notebooks")
      .select("*")
      .eq("study_session_id", study_session_id)
      .eq("notebook_id", notebook_id)
      .single()

    if (snb) {
      const newAnswered = snb.answered + 1
      const update: Record<string, unknown> = { answered: newAnswered }
      if (newAnswered >= snb.total) {
        update.completed_at = new Date().toISOString()
      }
      await supabaseServer
        .from("study_session_notebooks")
        .update(update)
        .eq("id", snb.id)
    }
  }

  answeredQuestions.add(question_id)
  const tecIdNum = Number(tec_id)
  const answeredTec = new Set<number>(session.answered_tec_ids ?? [])
  if (!Number.isNaN(tecIdNum)) answeredTec.add(tecIdNum)
  const allDone = answeredQuestions.size >= queue.length

  await supabaseServer
    .from("study_sessions")
    .update({
      answered_tec_ids: [...answeredTec],
      current_index: session.current_index + 1,
      status: allDone ? "completed" : "in_progress",
      updated_at: new Date().toISOString(),
    })
    .eq("id", study_session_id)

  return NextResponse.json({
    is_correct,
    correct_answer: question.correct_answer,
    tec_url: question.tec_url,
    confidence_level: confidence,
    outcome_category: computeOutcomeCategory(confidence, is_correct),
    session_completed: allDone,
  })
}
