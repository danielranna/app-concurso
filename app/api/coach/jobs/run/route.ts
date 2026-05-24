import { NextResponse } from "next/server"
import { runJobWorker } from "@/lib/ai/jobs/worker"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Number(body.limit) || 5, 15)
    const results = await runJobWorker(limit)
    return NextResponse.json({ processed: results.length, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
