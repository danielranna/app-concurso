import { NextResponse } from "next/server"
import { authenticateBot } from "@/lib/bot-auth"
import { getDeckFsrsParams, submitCardReview } from "@/lib/flashcard-review"
import { loadFlashcardSchedule, queueAnkiReview } from "@/lib/anki-flashcard-sync"
import { supabaseServer } from "@/lib/supabase-server"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateBot(req)
  if ("error" in auth) return auth.error

  const { id } = await params
  const { rating } = await req.json()

  if (!rating || rating < 1 || rating > 4) {
    return NextResponse.json({ error: "rating 1-4 obrigatório" }, { status: 400 })
  }

  const { data: dispatch, error: dErr } = await supabaseServer
    .from("flashcard_bot_dispatch")
    .select("card_id")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single()

  if (dErr || !dispatch) {
    return NextResponse.json({ error: "Dispatch não encontrado" }, { status: 404 })
  }

  const linked = await loadFlashcardSchedule(dispatch.card_id)
  if (linked.ankiNoteId) {
    const queued = await queueAnkiReview(auth.userId, dispatch.card_id, linked.ankiNoteId, rating)
    await supabaseServer
      .from("flashcard_bot_dispatch")
      .update({
        answered_at: new Date().toISOString(),
        rating,
      })
      .eq("id", id)
    return NextResponse.json(queued)
  }

  const deckParams = linked.deckId ? await getDeckFsrsParams(linked.deckId, auth.userId) : {}
  const result = await submitCardReview(auth.userId, dispatch.card_id, rating, deckParams)

  await supabaseServer
    .from("flashcard_bot_dispatch")
    .update({
      answered_at: new Date().toISOString(),
      rating,
    })
    .eq("id", id)

  return NextResponse.json({
    due_at: result.due_at,
    scheduled_days: result.log.log.scheduled_days,
  })
}
