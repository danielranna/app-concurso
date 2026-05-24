import { NextResponse } from "next/server"
import { enqueueJob } from "@/lib/ai/jobs/queue"
import { runJobWorker } from "@/lib/ai/jobs/worker"

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
      idempotencyKey: `ingest:${id}`,
      payload: { document_id: id },
      priority: 5,
    })

    const results = await runJobWorker(2)

    return NextResponse.json({ ok: true, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
