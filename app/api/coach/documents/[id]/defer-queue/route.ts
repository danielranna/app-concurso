import { NextResponse } from "next/server"
import { deferDocumentToQueueEnd } from "@/lib/ai/jobs/document-ingest-worker"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const user_id = body.user_id as string
    if (!user_id) {
      return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
    }

    await deferDocumentToQueueEnd(user_id, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
