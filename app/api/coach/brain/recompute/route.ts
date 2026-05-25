import { NextResponse } from "next/server"
import { recomputeSubjectBrain } from "@/lib/ai/subject-brain"

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, subject_id, skip_llm } = body

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "user_id e subject_id são obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const result = await recomputeSubjectBrain(user_id, subject_id, {
      skipLlm: Boolean(skip_llm),
    })
    return NextResponse.json({
      state: result.state,
      summary_md: result.summaryMd,
      used_llm: result.usedLlm,
      report_merged: result.reportMerged,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
