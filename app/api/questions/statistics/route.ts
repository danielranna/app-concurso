import { NextResponse } from "next/server"
import {
  fetchQuestionStatistics,
  type StatsPeriod,
} from "@/lib/question-statistics"

const VALID_PERIODS: StatsPeriod[] = ["all", "7d", "30d", "90d"]

export async function GET(req: Request) {
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const periodParam = (url.searchParams.get("period") ?? "all") as StatsPeriod
  const period = VALID_PERIODS.includes(periodParam) ? periodParam : "all"

  const subjectIds = url.searchParams.get("subject_ids")
  const subject_ids = subjectIds
    ? subjectIds.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined

  try {
    const data = await fetchQuestionStatistics(user_id, { period, subjectIds: subject_ids })
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
