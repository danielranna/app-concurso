import { NextResponse } from "next/server"
import { authenticateBot } from "@/lib/bot-auth"
import { getPendingForBot } from "@/lib/flashcard-queue"

export async function GET(req: Request) {
  const auth = await authenticateBot(req)
  if ("error" in auth) return auth.error

  try {
    const pending = await getPendingForBot(auth.userId)
    const n = pending.count
    const message_template =
      n === 0
        ? null
        : `Você tem ${n} card${n > 1 ? "s" : ""} pendente${n > 1 ? "s" : ""} para estudar (${pending.overdue_yesterday} de ontem). Deseja fazê-los hoje? Responda SIM ou NÃO.`

    return NextResponse.json({
      ...pending,
      should_remind: n > 0,
      message_template,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
