import { NextResponse } from "next/server"
import { deleteCoachDocument } from "@/lib/coach-documents"
import { enqueueMaterialParse } from "@/lib/ai/jobs/document-enqueue"

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

    await enqueueMaterialParse(user_id, id, { force: true })

    return NextResponse.json({ ok: true, queued: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
