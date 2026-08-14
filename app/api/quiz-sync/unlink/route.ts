import { NextResponse } from "next/server"
import { getQuizBotSecret } from "@/lib/quiz-bot-url"
import { unlinkCadernoFromApp } from "@/lib/quiz-sync"
import { logQuizSyncEvent } from "@/lib/quiz-sync-log"

export async function POST(req: Request) {
  const secret = getQuizBotSecret()
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const cadernoId = body.cadernoId != null ? Number(body.cadernoId) : NaN
  if (!Number.isFinite(cadernoId) || cadernoId <= 0) {
    await logQuizSyncEvent({
      direction: "in",
      kind: "unlink",
      ok: false,
      http_status: 400,
      reason: "cadernoId obrigatório",
      payload: body,
    })
    return NextResponse.json({ error: "cadernoId obrigatório" }, { status: 400 })
  }
  try {
    await unlinkCadernoFromApp(cadernoId)
    await logQuizSyncEvent({
      direction: "in",
      kind: "unlink",
      ok: true,
      http_status: 200,
      caderno_id: cadernoId,
      payload: body,
    })
    return NextResponse.json({ ok: true, cadernoId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    await logQuizSyncEvent({
      direction: "in",
      kind: "unlink",
      ok: false,
      http_status: 500,
      reason: msg,
      caderno_id: cadernoId,
      payload: body,
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
