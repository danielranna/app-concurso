import { NextResponse } from "next/server"
import { getQuizBotSecret } from "@/lib/quiz-bot-url"
import { flushPendingForTec } from "@/lib/quiz-sync"

export async function POST(req: Request) {
  const secret = getQuizBotSecret()
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const tecId = body.tecId != null ? Number(body.tecId) : null
  const shortId = String(body.shortId || "").trim()
  if (!shortId && !tecId) {
    return NextResponse.json({ error: "tecId ou shortId obrigatório" }, { status: 400 })
  }
  try {
    const result = await flushPendingForTec({
      tecId: Number.isFinite(tecId) ? tecId : null,
      shortId,
      publishedQuestionId: body.publishedQuestionId != null ? Number(body.publishedQuestionId) : undefined,
      cadernoId: body.cadernoId != null && Number.isFinite(Number(body.cadernoId))
        ? Number(body.cadernoId)
        : undefined,
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
