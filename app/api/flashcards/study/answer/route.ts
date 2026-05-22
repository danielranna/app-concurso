import { NextResponse } from "next/server"
import { getDeckFsrsParams, submitCardReview } from "@/lib/flashcard-review"
import { supabaseServer } from "@/lib/supabase-server"

export async function POST(req: Request) {
  const { user_id, card_id, rating, deck_id } = await req.json()

  if (!user_id || !card_id || !rating) {
    return NextResponse.json({ error: "user_id, card_id e rating são obrigatórios" }, { status: 400 })
  }

  if (rating < 1 || rating > 4) {
    return NextResponse.json({ error: "rating deve ser 1-4" }, { status: 400 })
  }

  try {
    let deckParams = {}
    if (deck_id) {
      deckParams = await getDeckFsrsParams(deck_id)
    } else {
      const { data: card } = await supabaseServer
        .from("flashcards")
        .select("deck_id")
        .eq("id", card_id)
        .single()
      if (card?.deck_id) deckParams = await getDeckFsrsParams(card.deck_id)
    }

    const result = await submitCardReview(user_id, card_id, rating, deckParams)
    return NextResponse.json({
      due_at: result.due_at,
      scheduled_days: result.log.log.scheduled_days,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
