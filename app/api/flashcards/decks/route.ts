import { NextResponse } from "next/server"
import { ensureSubjectDecks } from "@/lib/flashcard-subjects"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  try {
    const { subjects } = await ensureSubjectDecks(user_id)
    const list = subjects.map((s) => ({
      id: s.deck_id,
      name: s.name,
      subject_id: s.subject_id,
      fsrs_parameters: {},
      created_at: null,
    }))
    return NextResponse.json(list)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, subject_id, fsrs_parameters } = body

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "Baralhos são criados automaticamente por matéria (subject_id)" },
      { status: 400 }
    )
  }

  try {
    const { subjects } = await ensureSubjectDecks(user_id)
    const existing = subjects.find((s) => s.subject_id === subject_id)
    if (existing) {
      if (fsrs_parameters) {
        await supabaseServer
          .from("flashcard_decks")
          .update({ fsrs_parameters, updated_at: new Date().toISOString() })
          .eq("id", existing.deck_id)
      }
      return NextResponse.json({
        id: existing.deck_id,
        name: existing.name,
        subject_id: existing.subject_id,
      })
    }
    return NextResponse.json({ error: "Matéria não encontrada" }, { status: 404 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
