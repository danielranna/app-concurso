import { NextResponse } from "next/server"
import { replayPendingGabaritos, retryFailedIngests } from "@/lib/quiz-sync"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const days = Math.min(7, Math.max(1, Number(body.days) || 3))
  const user_id = String(body.user_id || "").trim()
  try {
    let retried = 0
    if (user_id) {
      const retry = await retryFailedIngests(user_id, 200).catch(() => ({ retried: 0 }))
      retried = Number(retry.retried) || 0
    }
    const result = await replayPendingGabaritos(days)
    return NextResponse.json({ ...result, retried })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
