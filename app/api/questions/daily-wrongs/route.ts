import { NextResponse } from "next/server"
import { listDailyWrongAttempts } from "@/lib/daily-wrong-attempts"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  const date = url.searchParams.get("date") ?? undefined
  const countOnly = url.searchParams.get("count_only") === "1"

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const result = await listDailyWrongAttempts(user_id, date)
    if (countOnly) {
      return NextResponse.json({ date: result.date, count: result.count })
    }
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
