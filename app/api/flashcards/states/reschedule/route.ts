import { NextResponse } from "next/server"
import { setCardDueAt, spreadCardDueDates } from "@/lib/flashcard-reschedule"

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, card_ids, mode, due_at, spread_days } = body

  if (!user_id || !Array.isArray(card_ids) || card_ids.length === 0) {
    return NextResponse.json(
      { error: "user_id e card_ids são obrigatórios" },
      { status: 400 }
    )
  }

  try {
    if (mode === "spread") {
      const maxDays = Math.min(365, Math.max(0, Number(spread_days ?? 0)))
      const result = await spreadCardDueDates(user_id, card_ids, maxDays)
      return NextResponse.json({ ok: true, ...result })
    }

    if (mode === "set" && due_at) {
      const due = new Date(due_at)
      if (Number.isNaN(due.getTime())) {
        return NextResponse.json({ error: "due_at inválido" }, { status: 400 })
      }
      for (const cardId of card_ids) {
        await setCardDueAt(user_id, cardId, due)
      }
      return NextResponse.json({ ok: true, count: card_ids.length })
    }

    return NextResponse.json(
      { error: "mode deve ser 'spread' ou 'set' (com due_at)" },
      { status: 400 }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
