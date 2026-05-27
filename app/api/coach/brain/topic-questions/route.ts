import { NextResponse } from "next/server"
import { fetchBrainTopicQuestions } from "@/lib/ai/brain-detail"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")
  const topic_key = searchParams.get("topic_key")

  if (!user_id || !subject_id || !topic_key) {
    return NextResponse.json(
      { error: "user_id, subject_id e topic_key obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const questions = await fetchBrainTopicQuestions(
      user_id,
      subject_id,
      topic_key
    )
    return NextResponse.json({ questions })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
