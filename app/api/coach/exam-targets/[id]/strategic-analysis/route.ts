import { NextResponse } from "next/server"
import { buildStrategicAnalysisPayload, getGlobalTopicRanking } from "@/lib/strategic-analysis"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const analysis = await buildStrategicAnalysisPayload(user_id, id)
    const topic_ranking = await getGlobalTopicRanking(user_id, id, 40)
    return NextResponse.json({ ...analysis, topic_ranking })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
