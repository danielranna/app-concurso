import { NextResponse } from "next/server"
import { authenticateBot } from "@/lib/bot-auth"
import { toBotPayload } from "@/lib/flashcard-content"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const auth = await authenticateBot(req)
  if ("error" in auth) return auth.error

  const now = new Date().toISOString()

  const { data: dispatches, error } = await supabaseServer
    .from("flashcard_bot_dispatch")
    .select("id, card_id, scheduled_at, session_id")
    .eq("user_id", auth.userId)
    .is("sent_at", null)
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!dispatches?.length) return NextResponse.json([])

  const cardIds = dispatches.map((d) => d.card_id)
  const { data: cards } = await supabaseServer
    .from("flashcards")
    .select("*, flashcard_decks(name)")
    .in("id", cardIds)

  const cardMap = new Map((cards ?? []).map((c) => [c.id, c]))

  const result = dispatches.map((d) => {
    const card = cardMap.get(d.card_id)
    return {
      dispatch_id: d.id,
      session_id: d.session_id,
      scheduled_at: d.scheduled_at,
      card: card ? toBotPayload(card as never) : null,
    }
  })

  return NextResponse.json(result)
}
