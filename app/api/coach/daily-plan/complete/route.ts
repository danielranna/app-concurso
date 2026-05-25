import { NextResponse } from "next/server"
import { markPlanBlockComplete } from "@/lib/ai/execution-plan"

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, plan_id, block_key } = body

  if (!user_id || !plan_id || !block_key) {
    return NextResponse.json(
      { error: "user_id, plan_id e block_key são obrigatórios" },
      { status: 400 }
    )
  }

  try {
    await markPlanBlockComplete(user_id, plan_id, block_key)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
