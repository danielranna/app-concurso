import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function POST(req: Request) {
  const { user_id, card_ids } = await req.json()

  if (!user_id || !Array.isArray(card_ids) || card_ids.length === 0) {
    return NextResponse.json(
      { error: "user_id e card_ids são obrigatórios" },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from("flashcards")
    .delete()
    .eq("user_id", user_id)
    .in("id", card_ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: card_ids.length })
}
