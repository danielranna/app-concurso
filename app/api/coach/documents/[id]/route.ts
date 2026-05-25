import { NextResponse } from "next/server"
import { deleteCoachDocument } from "@/lib/coach-documents"
import { enqueueJob } from "@/lib/ai/jobs/queue"

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const user_id = searchParams.get("user_id")
    if (!user_id) {
      return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
    }
    await deleteCoachDocument(user_id, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

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

    await enqueueJob({
      userId: user_id,
      jobType: "document_ingest",
      idempotencyKey: `ingest:${id}:reprocess:${Date.now()}`,
      payload: { document_id: id },
      priority: 7,
    })

    return NextResponse.json({ ok: true, queued: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
