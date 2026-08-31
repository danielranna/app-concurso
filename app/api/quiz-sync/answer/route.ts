import { NextResponse } from "next/server"
import { getQuizBotSecret } from "@/lib/quiz-bot-url"
import { ingestWhatsappAnswer } from "@/lib/quiz-sync"
import { logQuizSyncEvent } from "@/lib/quiz-sync-log"

export const maxDuration = 120

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
  const cadernoId =
    body.cadernoId != null && Number.isFinite(Number(body.cadernoId))
      ? Number(body.cadernoId)
      : null

  if (!userJid || !answerLetter) {
    await logQuizSyncEvent({
      direction: "in",
      kind: "answer",
      ok: false,
      http_status: 400,
      reason: "userJid e answerLetter obrigatórios",
      caderno_id: cadernoId,
      tec_id: Number.isFinite(tecId) ? tecId : null,
      user_jid: userJid || null,
      payload: body,
    })
    return NextResponse.json({ error: "userJid e answerLetter obrigatórios" }, { status: 400 })
  }

  try {
    const result = await ingestWhatsappAnswer({
      tecId: Number.isFinite(tecId) && tecId! > 0 ? tecId : null,
      shortId: body.shortId ?? null,
      cadernoId,
      userJid,
      answerLetter,
      comment: body.comment ?? null,
      confidenceLevel: body.confidenceLevel,
      durationMs: body.durationMs ?? null,
      tags: Array.isArray(body.tags) ? body.tags : [],
    })
    await logQuizSyncEvent({
      direction: "in",
      kind: "answer",
      ok: Boolean(result && "ok" in result && result.ok),
      http_status: 200,
      pending: Boolean(result && "skipped" in result && result.skipped),
      reason:
        result && "reason" in result
          ? String(result.reason)
          : result && "skipped" in result && result.skipped
            ? "skipped"
            : null,
      caderno_id: cadernoId,
      tec_id: Number.isFinite(tecId) ? tecId : null,
      user_jid: userJid,
      payload: { request: body, result },
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    await logQuizSyncEvent({
      direction: "in",
      kind: "answer",
      ok: false,
      http_status: 500,
      reason: msg,
      caderno_id: cadernoId,
      tec_id: Number.isFinite(tecId) ? tecId : null,
      user_jid: userJid,
      payload: body,
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
