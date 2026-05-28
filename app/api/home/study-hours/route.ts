import { NextResponse } from "next/server"
import { formatStudyDuration, getTotalStudyMs } from "@/lib/study-hours"

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const total_ms = await getTotalStudyMs(user_id)
    return NextResponse.json({
      total_ms,
      formatted: formatStudyDuration(total_ms),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
