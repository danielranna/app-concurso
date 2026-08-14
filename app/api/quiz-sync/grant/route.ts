import { NextResponse } from "next/server"
import { getQuizBotSecret } from "@/lib/quiz-bot-url"
import { grantCadernoToJid } from "@/lib/quiz-sync"
import { logQuizSyncEvent } from "@/lib/quiz-sync-log"

export async function POST(req: Request) {
  const secret = getQuizBotSecret()
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const cadernoId = Number(body.cadernoId)
  const jids = Array.isArray(body.userJids)
    ? body.userJids.map((j: unknown) => String(j || "").trim()).filter(Boolean)
    : [String(body.userJid || "").trim()].filter(Boolean)

  if (!Number.isFinite(cadernoId) || cadernoId <= 0 || !jids.length) {
    await logQuizSyncEvent({
      direction: "in",
      kind: "grant",
      ok: false,
      http_status: 400,
      reason: "cadernoId e userJid obrigatórios",
      caderno_id: Number.isFinite(cadernoId) ? cadernoId : null,
      payload: body,
    })
    return NextResponse.json({ error: "cadernoId e userJid obrigatórios" }, { status: 400 })
  }

  const results = []
  for (const userJid of jids) {
    try {
      const result = await grantCadernoToJid(cadernoId, userJid)
      results.push({ userJid, ...result })
      await logQuizSyncEvent({
        direction: "in",
        kind: "grant",
        ok: Boolean(result && "ok" in result && result.ok),
        http_status: 200,
        pending: Boolean(result && "skipped" in result && result.skipped),
        reason: result && "reason" in result ? String(result.reason) : null,
        caderno_id: cadernoId,
        user_jid: userJid,
        payload: result,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro"
      results.push({ userJid, skipped: true, reason: msg })
      await logQuizSyncEvent({
        direction: "in",
        kind: "grant",
        ok: false,
        http_status: 500,
        reason: msg,
        caderno_id: cadernoId,
        user_jid: userJid,
      })
    }
  }

  return NextResponse.json({ ok: true, cadernoId, results })
}
