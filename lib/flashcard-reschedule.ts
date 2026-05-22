import { State } from "ts-fsrs"
import { supabaseServer } from "./supabase-server"
import {
  deserializeFsrsCard,
  emptyFsrsCard,
  serializeFsrsCard,
} from "./fsrs-scheduler"

/** Distribui datas uniformemente entre agora e maxDays (0 = todos hoje). */
export function computeSpreadDates(count: number, maxDays: number, start = new Date()): Date[] {
  if (count <= 0) return []
  if (maxDays <= 0) return Array.from({ length: count }, () => new Date(start))

  const spanMs = maxDays * 24 * 60 * 60 * 1000
  if (count === 1) return [new Date(start.getTime() + spanMs)]

  return Array.from({ length: count }, (_, i) => {
    const fraction = i / (count - 1)
    return new Date(start.getTime() + fraction * spanMs)
  })
}

function shuffleIds(ids: string[]): string[] {
  const a = [...ids]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function setCardDueAt(userId: string, cardId: string, dueAt: Date) {
  const { data: row } = await supabaseServer
    .from("flashcard_states")
    .select("id, state_data")
    .eq("user_id", userId)
    .eq("card_id", cardId)
    .maybeSingle()

  const now = new Date()
  const days = Math.max(0, (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  let stateData: Record<string, unknown>
  if (row?.state_data) {
    const fsrsCard = deserializeFsrsCard(row.state_data as Record<string, unknown>)
    fsrsCard.due = dueAt
    fsrsCard.scheduled_days = days
    if (days >= 1) fsrsCard.state = State.Review
    stateData = serializeFsrsCard(fsrsCard) as unknown as Record<string, unknown>
  } else {
    const fsrsCard = emptyFsrsCard()
    fsrsCard.due = dueAt
    fsrsCard.scheduled_days = days
    if (days >= 1) fsrsCard.state = State.Review
    stateData = serializeFsrsCard(fsrsCard) as unknown as Record<string, unknown>
  }

  const payload = {
    user_id: userId,
    card_id: cardId,
    due_at: dueAt.toISOString(),
    state_data: stateData,
    updated_at: new Date().toISOString(),
  }

  if (row?.id) {
    const { error } = await supabaseServer
      .from("flashcard_states")
      .update(payload)
      .eq("id", row.id)
    if (error) throw error
  } else {
    const { error } = await supabaseServer.from("flashcard_states").insert(payload)
    if (error) throw error
  }
}

export async function spreadCardDueDates(
  userId: string,
  cardIds: string[],
  maxDays: number,
  shuffle = true
) {
  const ordered = shuffle ? shuffleIds(cardIds) : cardIds
  const dates = computeSpreadDates(ordered.length, maxDays)
  for (let i = 0; i < ordered.length; i++) {
    await setCardDueAt(userId, ordered[i], dates[i])
  }
  return { count: ordered.length, max_days: maxDays }
}
