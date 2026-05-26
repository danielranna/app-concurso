import { NextResponse } from "next/server"
import { enqueueMaterialIngest } from "@/lib/ai/jobs/document-enqueue"
import { supabaseServer } from "@/lib/supabase-server"

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

    await supabaseServer
      .from("subject_documents")
      .update({
        ingest_stage: "uploaded",
        status: "pending",
        ingest_error: null,
      })
      .eq("id", id)
      .eq("user_id", user_id)

    await enqueueMaterialIngest(user_id, id, { force: true })

    return NextResponse.json({ ok: true, queued: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
