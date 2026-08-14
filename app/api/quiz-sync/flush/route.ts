import { NextResponse } from "next/server"
import { getQuizBotSecret } from "@/lib/quiz-bot-url"
import { flushPendingForTec } from "@/lib/quiz-sync"
import { logQuizSyncEvent } from "@/lib/quiz-sync-log"

export async function POST(req: Request) {
  const secret = getQuizBotSecret()
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const tecId = body.tecId != null ? Number(body.tecId) : null
  const shortId = String(body.shortId || "").trim()
  const cadernoId =
    body.cadernoId != null && Number.isFinite(Number(body.cadernoId))
      ? Number(body.cadernoId)
      : undefined
  if (!shortId && !tecId) {
    await logQuizSyncEvent({
      direction: "in",
      kind: "flush",
      ok: false,
      http_status: 400,
      reason: "tecId ou shortId obrigatório",
      payload: body,
    })
    return NextResponse.json({ error: "tecId ou shortId obrigatório" }, { status: 400 })
  }
  try {
    const result = await flushPendingForTec({
      tecId: Number.isFinite(tecId) ? tecId : null,
      shortId,
      publishedQuestionId:
        body.publishedQuestionId != null ? Number(body.publishedQuestionId) : undefined,
      cadernoId,
    })
    await logQuizSyncEvent({
      direction: "in",
      kind: "flush",
      ok: true,
      http_status: 200,
      reason: result.reason ?? (result.flushed === 0 ? "no_attempts" : null),
      caderno_id: cadernoId ?? null,
      tec_id: Number.isFinite(tecId) ? tecId : null,
      payload: { request: body, result },
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    await logQuizSyncEvent({
      direction: "in",
      kind: "flush",
      ok: false,
      http_status: 500,
      reason: msg,
      caderno_id: cadernoId ?? null,
      tec_id: Number.isFinite(tecId) ? tecId : null,
      payload: body,
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
