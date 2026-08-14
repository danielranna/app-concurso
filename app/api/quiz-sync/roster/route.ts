import { NextResponse } from "next/server"
import { getQuizBotSecret } from "@/lib/quiz-bot-url"
import { fetchAppSideRoster } from "@/lib/quiz-sync"

export async function GET(req: Request) {
  const secret = getQuizBotSecret()
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const cadernoId = Number(new URL(req.url).searchParams.get("cadernoId"))
  if (!Number.isFinite(cadernoId) || cadernoId <= 0) {
    return NextResponse.json({ error: "cadernoId obrigatório" }, { status: 400 })
  }
  try {
    const roster = await fetchAppSideRoster(cadernoId)
    return NextResponse.json({
      cadernoId,
      notebookId: roster.notebookId,
      linked: Boolean(roster.notebookId),
      people: roster.people,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
