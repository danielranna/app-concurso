import { supabaseServer } from "./supabase-server"
import { submitCardReview } from "./flashcard-review"
import {
  decodeErrorReviewBack,
  resolveErrorReviewFsrsParams,
} from "./error-review-flashcard"
import { deriveLearningStatus } from "./error-learning-status"
import {
  buildScheduler,
  deserializeFsrsCard,
  previewLabels,
} from "./fsrs-scheduler"

function normalizeCe(selected: string): "Certo" | "Errado" | null {
  const s = selected.trim().toLowerCase()
  if (s === "errado" || s === "e") return "Errado"
  if (s === "certo" || s === "c") return "Certo"
  return null
}

/** Só confere Certo/Errado e devolve preview FSRS — não agenda ainda. */
export async function checkErrorReviewCeAnswer(params: {
  userId: string
  cardId: string
  selected: string
}) {
  const selected = normalizeCe(params.selected)
  if (!selected) throw new Error("selected_answer deve ser Certo ou Errado")

  const { data: card } = await supabaseServer
    .from("flashcards")
    .select("id, deck_id, back_text, front_text")
    .eq("id", params.cardId)
    .eq("user_id", params.userId)
    .maybeSingle()

  if (!card) throw new Error("Card não encontrado")

  const decoded = decodeErrorReviewBack(card.back_text)
  if (!decoded) throw new Error("Card não é uma revisão C/E de erro")

  const isCorrect =
    selected.toLowerCase() === decoded.answer.trim().toLowerCase()

  const { data: state } = await supabaseServer
    .from("flashcard_states")
    .select("state_data")
    .eq("user_id", params.userId)
    .eq("card_id", params.cardId)
    .maybeSingle()

  const deckParams = await resolveErrorReviewFsrsParams(params.userId)
  const fsrsCard = deserializeFsrsCard(
    (state?.state_data as Record<string, unknown>) ?? {}
  )
  const scheduler = buildScheduler(deckParams)
  const preview = scheduler.repeat(fsrsCard, new Date())

  return {
    is_correct: isCorrect,
    correct_answer: decoded.answer,
    explanation: decoded.explanation,
    knowledge_summary: decoded.knowledge_summary,
    statement: card.front_text,
    selected,
    preview: previewLabels(preview),
    suggested_rating: isCorrect ? 3 : 1,
  }
}

/** Agenda com rating 1–4 (FSRS do deck de erros). */
export async function submitErrorReviewCeAnswer(params: {
  userId: string
  cardId: string
  selected: string
  rating: number
}) {
  const selected = normalizeCe(params.selected)
  if (!selected) throw new Error("selected_answer deve ser Certo ou Errado")

  const rating = Number(params.rating)
  if (![1, 2, 3, 4].includes(rating)) {
    throw new Error("rating deve ser 1–4")
  }

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
    selected.toLowerCase() === decoded.answer.trim().toLowerCase()

  const deckParams = await resolveErrorReviewFsrsParams(params.userId)
  const result = await submitCardReview(
    params.userId,
    params.cardId,
    rating,
    deckParams
  )

  const next = result.nextCard
  const nowIso = new Date().toISOString()

  const { data: linkedErrors } = await supabaseServer
    .from("errors")
    .select("id, recurrence_count, knowledge_key")
    .eq("user_id", params.userId)
    .eq("active_flashcard_id", params.cardId)

  // Incrementa recurrence se C/E errado OU rating = Again (plano).
  for (const err of linkedErrors ?? []) {
    const prevCount = Math.max(1, Number(err.recurrence_count ?? 1))
    const recurrence =
      !isCorrect || rating === 1 ? prevCount + 1 : prevCount

    const status = deriveLearningStatus({
      fsrsState: next.state,
      scheduledDays: next.scheduled_days,
      stability: next.stability,
      reps: next.reps,
      lastRating: rating,
      recurrenceCount: recurrence,
      hasActiveCard: true,
    })

    await supabaseServer
      .from("errors")
      .update({
        last_reviewed_at: nowIso,
        learning_status: status,
        recurrence_count: recurrence,
        ...(recurrence > 1 ? { error_status: "reincidente" } : {}),
      })
      .eq("id", err.id)
  }

  if ((!linkedErrors || linkedErrors.length === 0) && card.source_error_id) {
    const { data: src } = await supabaseServer
      .from("errors")
      .select("id, recurrence_count")
      .eq("id", card.source_error_id)
      .maybeSingle()
    if (src?.id) {
      const prevCount = Math.max(1, Number(src.recurrence_count ?? 1))
      const recurrence =
        !isCorrect || rating === 1 ? prevCount + 1 : prevCount
      const learningStatus = deriveLearningStatus({
        fsrsState: next.state,
        scheduledDays: next.scheduled_days,
        stability: next.stability,
        reps: next.reps,
        lastRating: rating,
        recurrenceCount: recurrence,
        hasActiveCard: true,
      })
      await supabaseServer
        .from("errors")
        .update({
          last_reviewed_at: nowIso,
          learning_status: learningStatus,
          recurrence_count: recurrence,
          active_flashcard_id: params.cardId,
          ...(recurrence > 1 ? { error_status: "reincidente" } : {}),
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
  }
}
