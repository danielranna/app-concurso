import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { ensureCardState } from "@/lib/flashcard-review"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const deck_id = searchParams.get("deck_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  let query = supabaseServer
    .from("flashcards")
    .select(
      `
      id, deck_id, type, front_text, back_text, cloze_text,
      image_url, image_occluded_url, image_masks, created_at,
      flashcard_decks ( name ),
      flashcard_states ( due_at, state_data )
    `
    )
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })

  if (deck_id) query = query.eq("deck_id", deck_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const {
    user_id,
    deck_id,
    type,
    front_text,
    back_text,
    cloze_text,
    image_url,
    image_occluded_url,
    image_masks,
  } = body

  if (!user_id || !deck_id || !type) {
    return NextResponse.json({ error: "user_id, deck_id e type são obrigatórios" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("flashcards")
    .insert({
      user_id,
      deck_id,
      type,
      front_text: front_text ?? null,
      back_text: back_text ?? null,
      cloze_text: cloze_text ?? null,
      image_url: image_url ?? null,
      image_occluded_url: image_occluded_url ?? null,
      image_masks: image_masks ?? [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await ensureCardState(user_id, data.id)
  return NextResponse.json(data)
}
