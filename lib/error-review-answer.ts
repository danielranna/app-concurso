import { supabaseServer } from "./supabase-server"
import { submitCardReview, ensureCardState } from "./flashcard-review"
import {
  decodeErrorReviewBack,
  resolveErrorReviewFsrsParams,
} from "./error-review-flashcard"
import { deriveLearningStatus } from "./error-learning-status"
import {
  buildScheduler,
  deserializeFsrsCard,
  previewLabels,
  serializeFsrsCard,
  applyReview,
  State,
} from "./fsrs-scheduler"
import type { Card } from "ts-fsrs"

/** Hard / Good / Easy no primeiro review (dias). Again segue FSRS. */
export const FIRST_ERROR_REVIEW_DAYS: Record<2 | 3 | 4, number> = {
  2: 1,
  3: 3,
  4: 7,
}

export function isFirstErrorReview(fsrsCard: Card): boolean {
  return Number(fsrsCard.reps ?? 0) === 0 || fsrsCard.state === State.New
}

export function firstReviewPreviewLabels(fsrsAgainLabel: string) {
  return {
    again: fsrsAgainLabel,
    hard: "1 dia",
    good: "3 dias",
    easy: "7 dias",
  }
}

function normalizeCe(selected: string): "Certo" | "Errado" | null {
  const s = selected.trim().toLowerCase()
  if (s === "errado" || s === "e") return "Errado"
  if (s === "certo" || s === "c") return "Certo"
  return null
}

function addDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
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
  const labels = previewLabels(preview)
  const first = isFirstErrorReview(fsrsCard)

  return {
    is_correct: isCorrect,
    correct_answer: decoded.answer,
    explanation: decoded.explanation,
    knowledge_summary: decoded.knowledge_summary,
    statement: card.front_text,
    selected,
    is_first_review: first,
    preview: first ? firstReviewPreviewLabels(labels.again) : labels,
    suggested_rating: isCorrect ? 3 : 1,
  }
}

/** Agenda com rating 1–4. No 1º review: Hard=1d, Good=3d, Easy=7d. */
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
  const stateRow = await ensureCardState(params.userId, params.cardId)
  const fsrsBefore = deserializeFsrsCard(
    stateRow.state_data as Record<string, unknown>
  )
  const first = isFirstErrorReview(fsrsBefore)

  let dueAt: string
  let next = fsrsBefore
  let scheduledDays = 0

  if (first && rating >= 2 && rating <= 4) {
    const days = FIRST_ERROR_REVIEW_DAYS[rating as 2 | 3 | 4]
    const { card: graded } = applyReview(fsrsBefore, rating, deckParams)
    graded.due = addDays(days)
    graded.scheduled_days = days
    graded.state = State.Review
    const after = serializeFsrsCard(graded)
    await supabaseServer
      .from("flashcard_states")
      .update({
        due_at: graded.due.toISOString(),
        state_data: after,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", params.userId)
      .eq("card_id", params.cardId)

    await supabaseServer.from("flashcard_review_logs").insert({
      user_id: params.userId,
      card_id: params.cardId,
      rating,
      state_before: serializeFsrsCard(fsrsBefore),
      state_after: after,
      scheduled_days: days,
    })

    next = graded
    dueAt = graded.due.toISOString()
    scheduledDays = days
  } else {
    const result = await submitCardReview(
      params.userId,
      params.cardId,
      rating,
      deckParams
    )
    next = result.nextCard
    dueAt = result.due_at
    scheduledDays = Number(result.log.log.scheduled_days ?? 0)
  }

  const nowIso = new Date().toISOString()

  const { data: linkedErrors } = await supabaseServer
    .from("errors")
    .select("id, recurrence_count, knowledge_key")
    .eq("user_id", params.userId)
    .eq("active_flashcard_id", params.cardId)

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
    due_at: dueAt,
    scheduled_days: scheduledDays,
    is_first_review: first,
  }
}
