import { NextResponse } from "next/server"
import { callQuizAssist, resolveJidByUserId } from "@/lib/quiz-sync"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const user_id = String(body.user_id || "").trim()
  const shortId = String(body.shortId || "").trim()
  const letter = String(body.letter || "").trim()
  if (!user_id || !shortId || !letter) {
    return NextResponse.json({ error: "user_id, shortId e letter obrigatórios" }, { status: 400 })
  }
  const jid = await resolveJidByUserId(user_id)
  if (!jid) {
    return NextResponse.json({ error: "WhatsApp não vinculado" }, { status: 400 })
  }
  try {
    const data = await callQuizAssist(jid, shortId, letter)
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
