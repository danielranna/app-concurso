import { NextResponse } from "next/server"
import { runJobWorker } from "@/lib/ai/jobs/worker"
import type { JobType } from "@/lib/ai/jobs/queue"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Number(body.limit) || 5, 15)
    const userId =
      typeof body.user_id === "string" && body.user_id.trim()
        ? body.user_id.trim()
        : undefined
    const jobTypes = Array.isArray(body.job_types)
      ? (body.job_types.filter(
          (t: unknown): t is JobType => typeof t === "string"
        ) as JobType[])
      : undefined
    const results = await runJobWorker(limit, { userId, jobTypes })
    return NextResponse.json({ processed: results.length, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
