import { NextResponse } from "next/server"
import { fetchPanelData, type PanelFilter } from "@/lib/flashcard-panel"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const filter = (searchParams.get("filter") ?? "due_today") as PanelFilter
  const deck_id = searchParams.get("deck_id") ?? undefined
  const subject_id = searchParams.get("subject_id") ?? undefined

  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  if (!["due_today", "overdue", "all"].includes(filter)) {
    return NextResponse.json({ error: "filter inválido" }, { status: 400 })
  }

  try {
    const data = await fetchPanelData(user_id, { filter, deckId: deck_id, subjectId: subject_id })
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
