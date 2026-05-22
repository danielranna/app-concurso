import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { endOfDay } from "@/lib/flashcard-queue"

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const todayEnd = endOfDay()

  const { data: decks, error: decksErr } = await supabaseServer
    .from("flashcard_decks")
    .select("id, name, created_at")
    .eq("user_id", user_id)
    .order("name")

  if (decksErr) {
    return NextResponse.json({ error: decksErr.message }, { status: 500 })
  }

  const { data: rows, error: cardsErr } = await supabaseServer
    .from("flashcards")
    .select(
      `
      id,
      deck_id,
      type,
      front_text,
      cloze_text,
      flashcard_states ( due_at )
    `
    )
    .eq("user_id", user_id)

  if (cardsErr) {
    return NextResponse.json({ error: cardsErr.message }, { status: 500 })
  }

  const now = new Date()

  const overview = (decks ?? []).map((deck) => {
    const deckCards = (rows ?? []).filter((c) => c.deck_id === deck.id)
    const withDue = deckCards
      .map((c) => {
        const state = Array.isArray(c.flashcard_states)
          ? c.flashcard_states[0]
          : c.flashcard_states
        const due_at = (state as { due_at?: string } | undefined)?.due_at
        const preview =
          c.front_text ||
          c.cloze_text?.replace(/\{\{c\d+::/g, "").replace(/\}\}/g, "").slice(0, 80) ||
          (c.type === "cloze_image" ? "(imagem)" : "—")
        return { id: c.id, preview, due_at: due_at ?? null }
      })
      .filter((c) => c.due_at)

    const dueToday = withDue.filter((c) => new Date(c.due_at!) <= todayEnd)
    const overdue = withDue.filter((c) => new Date(c.due_at!) < now)
    const sorted = [...withDue].sort(
      (a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()
    )

    return {
      id: deck.id,
      name: deck.name,
      created_at: deck.created_at,
      card_count: deckCards.length,
      due_today: dueToday.length,
      overdue_count: overdue.length,
      next_review_at: sorted[0]?.due_at ?? null,
      upcoming: sorted.slice(0, 8).map((c) => ({
        id: c.id,
        preview: c.preview,
        due_at: c.due_at,
        is_overdue: new Date(c.due_at!) < now,
        is_due_today: new Date(c.due_at!) <= todayEnd,
      })),
    }
  })

  return NextResponse.json({ decks: overview })
}
