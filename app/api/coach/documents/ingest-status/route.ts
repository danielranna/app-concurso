import { NextResponse } from "next/server"
import { readIngestStatus } from "@/lib/ai/ingest-status"
import type { EffectiveIngestStep } from "@/lib/ai/ingest-effective-step"
import { EFFECTIVE_STEPS } from "@/lib/ai/ingest-effective-step"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("user_id")?.trim()
    if (!userId) {
      return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
    }

    const stepParam = searchParams.get("step")?.trim()
    const step =
      stepParam && EFFECTIVE_STEPS.includes(stepParam as EffectiveIngestStep)
        ? (stepParam as EffectiveIngestStep)
        : undefined

    const limit = Number(searchParams.get("limit")) || 50
    const offset = Number(searchParams.get("offset")) || 0
    const q = searchParams.get("q") ?? undefined

    const details = await readIngestStatus(userId, { step, limit, offset, q })
    return NextResponse.json(details)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
