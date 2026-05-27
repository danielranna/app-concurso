import { NextResponse } from "next/server"
import { buildBrainDetailPayload } from "@/lib/ai/brain-detail"

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
    const data = await buildBrainDetailPayload(user_id, subject_id)
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
