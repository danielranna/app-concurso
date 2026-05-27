import { NextResponse } from "next/server"
import { processNextIngestDocument } from "@/lib/ai/jobs/document-ingest-worker"

export const runtime = "nodejs"
/** Plano Hobby = 60s; timeout interno em 52s para marcar erro e liberar a fila. */
export const maxDuration = 60

/** Processa o próximo PDF da fila (SELECT → pipeline completa → SELECT). */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const userId =
      typeof body.user_id === "string" && body.user_id.trim()
        ? body.user_id.trim()
        : ""

    if (!userId) {
      return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
    }

    const random = Boolean(body.random)
    const includeFailed = Boolean(body.include_failed)
    const result = await processNextIngestDocument(userId, { random, includeFailed })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
