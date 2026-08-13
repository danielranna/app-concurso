import { NextResponse } from "next/server"
import { sendNotebookToWhatsapp } from "@/lib/quiz-sync"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const user_id = String(body.user_id || "").trim()
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }
  try {
    const data = await sendNotebookToWhatsapp({
      notebookId: id,
      userId: user_id,
      name: body.name,
      activate: Boolean(body.activate),
      deliveryMode: body.deliveryMode === "private" ? "private" : "group",
      schedule: body.schedule ?? {},
      privateRecipients: body.privateRecipients,
      createdByJid: body.createdByJid,
    })
    return NextResponse.json({ ok: true, ...data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
