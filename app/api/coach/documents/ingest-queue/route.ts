import { NextResponse } from "next/server"
import { readIngestQueueDetails } from "@/lib/ai/jobs/document-ingest-worker"

/** GET leve: só lê fila na DB (subject_documents), sem heal. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("user_id")?.trim()
    if (!userId) {
      return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
    }

    const limit = Math.min(Number(searchParams.get("limit")) || 5, 50)
    const details = await readIngestQueueDetails(userId, { itemLimit: limit })

    return NextResponse.json(details)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
