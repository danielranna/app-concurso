import { NextResponse } from "next/server"
import {
  computeLearningSignals,
  getTopicStatsForSubject,
  persistLearningSignals,
} from "@/lib/learning-signals"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")
  const refresh = searchParams.get("refresh") === "1"

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const signals = await computeLearningSignals(user_id, subject_id)

    if (refresh && subject_id) {
      await persistLearningSignals(user_id, subject_id, signals)
    }

    const topic_stats = subject_id
      ? await getTopicStatsForSubject(user_id, subject_id)
      : []

    return NextResponse.json({ signals, topic_stats })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
