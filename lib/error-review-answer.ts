import { supabaseServer } from "./supabase-server"
import { getDeckFsrsParams, submitCardReview } from "./flashcard-review"
import { decodeErrorReviewBack } from "./error-review-flashcard"
import { deriveLearningStatus } from "./error-learning-status"
import { Rating } from "./fsrs-scheduler"

export async function submitErrorReviewCeAnswer(params: {
  userId: string
  cardId: string
  selected: "Certo" | "Errado"
}) {
  const { data: card } = await supabaseServer
    .from("flashcards")
    .select("id, deck_id, back_text, source_error_id, front_text")
    .eq("id", params.cardId)
    .eq("user_id", params.userId)
    .maybeSingle()

  if (!card) throw new Error("Card não encontrado")

  const decoded = decodeErrorReviewBack(card.back_text)
  if (!decoded) throw new Error("Card não é uma revisão C/E de erro")

  const isCorrect =
    params.selected.trim().toLowerCase() === decoded.answer.trim().toLowerCase()
  const rating = isCorrect ? Rating.Good : Rating.Again

  const deckParams = await getDeckFsrsParams(card.deck_id, params.userId)
  const result = await submitCardReview(
    params.userId,
    params.cardId,
    rating,
    deckParams
  )

  const next = result.nextCard
  const learningStatus = deriveLearningStatus({
    fsrsState: next.state,
    scheduledDays: next.scheduled_days,
    stability: next.stability,
    reps: next.reps,
    lastRating: rating,
    recurrenceCount: isCorrect ? 1 : 2,
    hasActiveCard: true,
  })

  const nowIso = new Date().toISOString()

  // Atualiza todos os erros ligados a este card
  const { data: linkedErrors } = await supabaseServer
    .from("errors")
    .select("id, recurrence_count, knowledge_key")
    .eq("user_id", params.userId)
    .eq("active_flashcard_id", params.cardId)

  for (const err of linkedErrors ?? []) {
    const prevCount = Math.max(1, Number(err.recurrence_count ?? 1))
    const nextCount = isCorrect ? prevCount : prevCount + 1
    const status = deriveLearningStatus({
      fsrsState: next.state,
      scheduledDays: next.scheduled_days,
      stability: next.stability,
      reps: next.reps,
      lastRating: rating,
      recurrenceCount: nextCount,
      hasActiveCard: true,
    })

    await supabaseServer
      .from("errors")
      .update({
        last_reviewed_at: nowIso,
        learning_status: status,
        recurrence_count: nextCount,
        ...(nextCount > 1 ? { error_status: "reincidente" } : {}),
      })
      .eq("id", err.id)
  }

  // Também pelo source_error_id se nenhum link via active_flashcard_id
  if ((!linkedErrors || linkedErrors.length === 0) && card.source_error_id) {
    const { data: src } = await supabaseServer
      .from("errors")
      .select("id, recurrence_count")
      .eq("id", card.source_error_id)
      .maybeSingle()
    if (src?.id) {
      const prevCount = Math.max(1, Number(src.recurrence_count ?? 1))
      const nextCount = isCorrect ? prevCount : prevCount + 1
      await supabaseServer
        .from("errors")
        .update({
          last_reviewed_at: nowIso,
          learning_status: learningStatus,
          recurrence_count: nextCount,
          active_flashcard_id: params.cardId,
          ...(nextCount > 1 ? { error_status: "reincidente" } : {}),
        })
        .eq("id", src.id)
    }
  }

  return {
    is_correct: isCorrect,
    correct_answer: decoded.answer,
    explanation: decoded.explanation,
    knowledge_summary: decoded.knowledge_summary,
    statement: card.front_text,
    rating,
    due_at: result.due_at,
    scheduled_days: result.log.log.scheduled_days,
    learning_status: learningStatus,
  }
}
