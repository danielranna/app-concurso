import { NextResponse } from "next/server"
import { submitErrorReviewCeAnswer } from "@/lib/error-review-answer"

export async function POST(req: Request) {
  const body = await req.json()
  const user_id = body.user_id as string
  const card_id = body.card_id as string
  const selectedRaw = String(body.selected_answer ?? body.selected ?? "").trim()

  if (!user_id || !card_id || !selectedRaw) {
    return NextResponse.json(
      { error: "user_id, card_id e selected_answer são obrigatórios" },
      { status: 400 }
    )
  }

  const selected =
    selectedRaw.toLowerCase() === "errado" || selectedRaw.toLowerCase() === "e"
      ? "Errado"
      : selectedRaw.toLowerCase() === "certo" || selectedRaw.toLowerCase() === "c"
        ? "Certo"
        : null

  if (!selected) {
    return NextResponse.json(
      { error: "selected_answer deve ser Certo ou Errado" },
      { status: 400 }
    )
  }

  try {
    const result = await submitErrorReviewCeAnswer({
      userId: user_id,
      cardId: card_id,
      selected,
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
