import { supabaseServer } from "../supabase-server"
import { generateErrorReviewQuestion } from "./agents/error-review-question"
import {
  createErrorReviewFlashcard,
  findActiveCardForKnowledgeKey,
  linkErrorsToFlashcard,
} from "../error-review-flashcard"
import { normalizeKnowledgeKey } from "../knowledge-key"

export async function processErrorReviewQuestionGenerate(
  userId: string,
  payload: Record<string, unknown>
) {
  const errorId = String(payload.error_id || "")
  const questionId = String(payload.question_id || "")
  const attemptId = String(payload.attempt_id || "")

  if (!errorId || !questionId) {
    throw new Error("error_id e question_id obrigatórios")
  }

  const { data: errorRow } = await supabaseServer
    .from("errors")
    .select(
      "id, user_id, active_flashcard_id, knowledge_key, knowledge_summary, topic_id, topics(subject_id)"
    )
    .eq("id", errorId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!errorRow) {
    return { skipped: true, reason: "error_not_found" }
  }

  // Já tem card ativo neste erro → não gerar de novo
  if (errorRow.active_flashcard_id) {
    const { data: card } = await supabaseServer
      .from("flashcards")
      .select("id")
      .eq("id", errorRow.active_flashcard_id)
      .maybeSingle()
    if (card?.id) {
      return {
        skipped: true,
        reason: "already_has_active_card",
        flashcard_id: card.id,
      }
    }
  }

  // Já conhece o knowledge_key e existe card do conhecimento → só vincula
  if (errorRow.knowledge_key) {
    const existingByKey = await findActiveCardForKnowledgeKey(
      userId,
      errorRow.knowledge_key as string
    )
    if (existingByKey) {
      await linkErrorsToFlashcard({
        userId,
        knowledgeKey: errorRow.knowledge_key as string,
        flashcardId: existingByKey.flashcardId,
        errorIds: [errorId],
      })
      return {
        linked_existing: true,
        flashcard_id: existingByKey.flashcardId,
        knowledge_key: errorRow.knowledge_key,
        skipped_generation: true,
      }
    }
  }

  const { data: question } = await supabaseServer
    .from("questions")
    .select("id, statement, type, correct_answer, tec_subject, tec_topic")
    .eq("id", questionId)
    .maybeSingle()

  if (!question) {
    return { skipped: true, reason: "question_not_found" }
  }

  const { data: options } = await supabaseServer
    .from("question_options")
    .select("label, text, sort_order")
    .eq("question_id", questionId)
    .order("sort_order", { ascending: true })

  let errorDetail: Record<string, unknown> | null = null
  let selectedAnswer = ""
  if (attemptId) {
    const { data: attempt } = await supabaseServer
      .from("question_attempts")
      .select("selected_answer, error_detail")
      .eq("id", attemptId)
      .maybeSingle()
    selectedAnswer = String(attempt?.selected_answer ?? "")
    errorDetail = (attempt?.error_detail as Record<string, unknown>) ?? null
  }

  const topics = errorRow.topics as
    | { subject_id?: string }
    | { subject_id?: string }[]
    | null
  const subjectId = Array.isArray(topics)
    ? topics[0]?.subject_id
    : topics?.subject_id

  const generated = await generateErrorReviewQuestion({
    userId,
    subjectId: subjectId ?? null,
    originalStatement: String(question.statement ?? ""),
    originalType: String(question.type ?? ""),
    correctAnswer: String(question.correct_answer ?? ""),
    selectedAnswer,
    options: (options ?? []).map((o) => ({
      label: o.label,
      text: o.text,
    })),
    errorDetail,
  })

  if (!generated.ok || !generated.knowledge_key || !generated.statement) {
    return {
      skipped: true,
      reason: generated.reason ?? "generation_failed",
      kept_error: true,
    }
  }

  const knowledgeKey = normalizeKnowledgeKey(
    generated.knowledge_key || generated.knowledge_summary || ""
  )

  await supabaseServer
    .from("errors")
    .update({
      knowledge_summary: generated.knowledge_summary,
      knowledge_key: knowledgeKey,
      explanation: generated.explanation ?? null,
    })
    .eq("id", errorId)

  // Regra central: 1 card ativo por conhecimento
  const existing = await findActiveCardForKnowledgeKey(userId, knowledgeKey)
  if (existing) {
    await linkErrorsToFlashcard({
      userId,
      knowledgeKey,
      flashcardId: existing.flashcardId,
      errorIds: [errorId],
    })
    return {
      linked_existing: true,
      flashcard_id: existing.flashcardId,
      knowledge_key: knowledgeKey,
    }
  }

  const flashcardId = await createErrorReviewFlashcard({
    userId,
    errorId,
    statement: generated.statement,
    answer: generated.answer!,
    explanation: generated.explanation!,
    knowledgeSummary: generated.knowledge_summary!,
  })

  await linkErrorsToFlashcard({
    userId,
    knowledgeKey,
    flashcardId,
    errorIds: [errorId],
  })

  // Propagar card a outros erros já com a mesma key sem card
  const { data: siblings } = await supabaseServer
    .from("errors")
    .select("id")
    .eq("user_id", userId)
    .eq("knowledge_key", knowledgeKey)
    .is("active_flashcard_id", null)

  const siblingIds = (siblings ?? []).map((s) => s.id as string).filter(Boolean)
  if (siblingIds.length) {
    await linkErrorsToFlashcard({
      userId,
      knowledgeKey,
      flashcardId,
      errorIds: siblingIds,
    })
  }

  return {
    created: true,
    flashcard_id: flashcardId,
    knowledge_key: knowledgeKey,
  }
}
