import { NextResponse } from "next/server"
import { regenerateBehavioralAuditOnly } from "@/lib/ai/notebook-report"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { user_id } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const { structured, auditModelUsed } = await regenerateBehavioralAuditOnly(
      id,
      user_id
    )
    return NextResponse.json({
      ok: true,
      audit_model_used: auditModelUsed,
      structured,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
