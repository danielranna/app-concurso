import { NextResponse } from "next/server"
import { generatePriorityVerdict } from "@/lib/ai/priority-orchestrator"

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, subject_id } = body

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "user_id e subject_id obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const result = await generatePriorityVerdict(user_id, subject_id)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
