import { NextResponse } from "next/server"
import { runSerialDocumentIngestWorker } from "@/lib/ai/jobs/document-ingest-worker"

export const runtime = "nodejs"
export const maxDuration = 300

/** Processa no máximo 1 etapa; heal só aqui (não no GET da fila). */
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

    const result = await runSerialDocumentIngestWorker(userId)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
