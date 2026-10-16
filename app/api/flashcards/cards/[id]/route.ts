import { NextResponse } from "next/server"
import { ankiNoteId } from "@/lib/anki-flashcard-sync"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabaseServer
    .from("flashcards")
    .select("*, flashcard_decks(name)")
    .eq("id", id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { user_id, ...fields } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const allowed = [
    "front_text",
    "back_text",
    "cloze_text",
    "image_url",
    "image_occluded_url",
    "image_masks",
    "deck_id",
  ] as const

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (fields[key] !== undefined) updates[key] = fields[key]
  }

  const { data, error } = await supabaseServer
    .from("flashcards")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  const fromAnki = url.searchParams.get("from_anki") === "1"

  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const linked = await supabaseServer
    .from("flashcards")
    .select("anki_note_id")
    .eq("id", id)
    .eq("user_id", user_id)
    .maybeSingle()
  const noteId = linked.error ? 0 : ankiNoteId(linked.data?.anki_note_id)
  if (noteId) {
    if (!fromAnki) {
      await supabaseServer.from("anki_note_tombstones").upsert(
        { user_id, anki_note_id: noteId },
        { onConflict: "user_id,anki_note_id" }
      )
    }
    await supabaseServer.from("errors").delete().eq("user_id", user_id).eq("anki_note_id", noteId)
  }

  const { error } = await supabaseServer
    .from("flashcards")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
