import { NextResponse } from "next/server"
import {
  ERROR_REVIEW_RETENTION_MAX,
  ERROR_REVIEW_RETENTION_MIN,
  getErrorReviewRetention,
  setErrorReviewRetention,
} from "@/lib/error-review-flashcard"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }
  try {
    const data = await getErrorReviewRetention(user_id)
    return NextResponse.json({
      ...data,
      min: ERROR_REVIEW_RETENTION_MIN,
      max: ERROR_REVIEW_RETENTION_MAX,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const user_id = body.user_id as string
  const retention = Number(body.request_retention ?? body.retention)
  if (!user_id || !Number.isFinite(retention)) {
    return NextResponse.json(
      { error: "user_id e request_retention são obrigatórios" },
      { status: 400 }
    )
  }
  try {
    const data = await setErrorReviewRetention(user_id, retention)
    return NextResponse.json({
      ...data,
      min: ERROR_REVIEW_RETENTION_MIN,
      max: ERROR_REVIEW_RETENTION_MAX,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
