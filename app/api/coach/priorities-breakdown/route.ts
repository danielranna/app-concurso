import { NextResponse } from "next/server"
import { computePriorityBreakdown } from "@/lib/ai/priority-breakdown"
import { recomputeStrategicQueue } from "@/lib/ai/strategic-queue"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "user_id e subject_id obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const breakdown = await computePriorityBreakdown(user_id, subject_id)
    return NextResponse.json(breakdown)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, subject_id, with_llm } = body

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "user_id e subject_id obrigatórios" },
      { status: 400 }
    )
  }

  try {
    await recomputeStrategicQueue(user_id, subject_id, {
      withLlmNarrative: Boolean(with_llm),
      autoLlm: Boolean(with_llm) ? false : undefined,
    })
    const breakdown = await computePriorityBreakdown(user_id, subject_id)
    return NextResponse.json(breakdown)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
