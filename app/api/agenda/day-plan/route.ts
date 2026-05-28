import { NextResponse } from "next/server"
import { getDayPlan, upsertBlockPlan } from "@/lib/agenda"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  const date = url.searchParams.get("date")

  if (!user_id || !date) {
    return NextResponse.json(
      { error: "user_id e date obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const plan = await getDayPlan(user_id, date)
    return NextResponse.json(plan)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const body = await req.json()
  const { user_id, agenda_date, weekly_block_id, plan_text } = body

  if (!user_id || !agenda_date || !weekly_block_id) {
    return NextResponse.json(
      { error: "user_id, agenda_date e weekly_block_id obrigatórios" },
      { status: 400 }
    )
  }

  try {
    await upsertBlockPlan({
      user_id,
      agenda_date,
      weekly_block_id,
      plan_text: plan_text ?? null,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
