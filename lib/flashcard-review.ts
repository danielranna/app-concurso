import { supabaseServer } from "./supabase-server"
import {
  applyReview,
  deserializeFsrsCard,
  emptyFsrsCard,
  serializeFsrsCard,
} from "./fsrs-scheduler"
import { resolveFsrsParams } from "./flashcard-fsrs-params"
import type { FSRSParameters } from "ts-fsrs"

export async function ensureCardState(userId: string, cardId: string) {
  const { data: existing } = await supabaseServer
    .from("flashcard_states")
    .select("id, state_data, due_at")
    .eq("user_id", userId)
    .eq("card_id", cardId)
    .maybeSingle()

  if (existing) return existing

  const card = emptyFsrsCard()
  const stateData = serializeFsrsCard(card)
  const { data, error } = await supabaseServer
    .from("flashcard_states")
    .insert({
      user_id: userId,
      card_id: cardId,
      due_at: card.due.toISOString(),
      state_data: stateData,
    })
    .select("id, state_data, due_at")
    .single()

  if (error) throw error
  return data
}

export async function submitCardReview(
  userId: string,
  cardId: string,
  rating: number,
  deckFsrsParams?: Partial<FSRSParameters>
) {
  const stateRow = await ensureCardState(userId, cardId)
  const fsrsCard = deserializeFsrsCard(stateRow.state_data as Record<string, unknown>)
  const before = serializeFsrsCard(fsrsCard)

  const { card: nextCard, log } = applyReview(fsrsCard, rating, deckFsrsParams)
  const after = serializeFsrsCard(nextCard)

  await supabaseServer
    .from("flashcard_states")
    .update({
      due_at: nextCard.due.toISOString(),
      state_data: after,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("card_id", cardId)

  await supabaseServer.from("flashcard_review_logs").insert({
    user_id: userId,
    card_id: cardId,
    rating,
    state_before: before,
    state_after: after,
    scheduled_days: log.log.scheduled_days, // ReviewLog inside RecordLogItem
  })

  return { nextCard, log, due_at: nextCard.due.toISOString() }
}

export async function getDeckFsrsParams(
  deckId: string,
  userId?: string
): Promise<Partial<FSRSParameters>> {
  if (userId) return resolveFsrsParams(userId, deckId)
  const { data } = await supabaseServer
    .from("flashcard_decks")
    .select("fsrs_parameters")
    .eq("id", deckId)
    .maybeSingle()
  return (data?.fsrs_parameters as Partial<FSRSParameters>) ?? {}
}
