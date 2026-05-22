import { NextResponse } from "next/server"
import { authenticateBot } from "@/lib/bot-auth"
import { getPendingForBot } from "@/lib/flashcard-queue"
import { supabaseServer } from "@/lib/supabase-server"

export async function POST(req: Request) {
  const auth = await authenticateBot(req)
  if ("error" in auth) return auth.error

  const body = await req.json().catch(() => ({}))
  let cardIds: string[] = body.card_ids ?? []

  if (cardIds.length === 0) {
    const pending = await getPendingForBot(auth.userId)
    cardIds = pending.card_ids
  }

  if (cardIds.length === 0) {
    return NextResponse.json({ error: "Nenhum card pendente" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("flashcard_bot_sessions")
    .insert({
      user_id: auth.userId,
      status: "pending_confirm",
      card_ids: cardIds,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
