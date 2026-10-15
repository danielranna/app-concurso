import { NextResponse } from "next/server"
import { getAgendaRange } from "@/lib/agenda"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const today = url.searchParams.get("today") ?? undefined

  if (!user_id || !from || !to) {
    return NextResponse.json(
      { error: "user_id, from e to obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const range = await getAgendaRange(user_id, from, to, today)
    return NextResponse.json(range)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
