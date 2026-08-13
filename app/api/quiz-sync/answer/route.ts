import { NextResponse } from "next/server"
import { getQuizBotSecret } from "@/lib/quiz-bot-url"
import { ingestWhatsappAnswer } from "@/lib/quiz-sync"

export async function POST(req: Request) {
  const secret = getQuizBotSecret()
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const tecId = body.tecId != null ? Number(body.tecId) : null
  const userJid = String(body.userJid || "").trim()
  const answerLetter = String(body.answerLetter || body.letter || "").trim()
  if (!userJid || !answerLetter) {
    return NextResponse.json({ error: "userJid e answerLetter obrigatórios" }, { status: 400 })
  }

  try {
    const result = await ingestWhatsappAnswer({
      tecId: Number.isFinite(tecId) && tecId! > 0 ? tecId : null,
      shortId: body.shortId ?? null,
      userJid,
      answerLetter,
      comment: body.comment ?? null,
      confidenceLevel: body.confidenceLevel,
      durationMs: body.durationMs ?? null,
      tags: Array.isArray(body.tags) ? body.tags : [],
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
