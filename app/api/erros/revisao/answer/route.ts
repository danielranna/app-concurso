import { NextResponse } from "next/server"
import {
  checkErrorReviewCeAnswer,
  submitErrorReviewCeAnswer,
} from "@/lib/error-review-answer"

export async function POST(req: Request) {
  const body = await req.json()
  const user_id = body.user_id as string
  const card_id = body.card_id as string
  const selectedRaw = String(body.selected_answer ?? body.selected ?? "").trim()
  const ratingRaw = body.rating
  const checkOnly =
    body.check_only === true ||
    ratingRaw === undefined ||
    ratingRaw === null ||
    ratingRaw === ""

  if (!user_id || !card_id || !selectedRaw) {
    return NextResponse.json(
      { error: "user_id, card_id e selected_answer são obrigatórios" },
      { status: 400 }
    )
  }

  try {
    if (checkOnly) {
      const result = await checkErrorReviewCeAnswer({
        userId: user_id,
        cardId: card_id,
        selected: selectedRaw,
      })
      return NextResponse.json(result)
    }

    const rating = Number(ratingRaw)
    if (![1, 2, 3, 4].includes(rating)) {
      return NextResponse.json(
        { error: "rating deve ser 1, 2, 3 ou 4" },
        { status: 400 }
      )
    }

    const result = await submitErrorReviewCeAnswer({
      userId: user_id,
      cardId: card_id,
      selected: selectedRaw,
      rating,
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
