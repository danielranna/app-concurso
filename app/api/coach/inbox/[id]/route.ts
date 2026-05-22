import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { approveAiActionDraft } from "@/lib/ai-action-approve"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { user_id, action, payload } = body as {
    user_id: string
    action: "approve" | "reject" | "update"
    payload?: Record<string, unknown>
  }

  if (!user_id || !action) {
    return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 })
  }

  if (action === "update" && payload) {
    const { error } = await supabaseServer
      .from("ai_action_drafts")
      .update({ payload })
      .eq("id", id)
      .eq("user_id", user_id)
      .eq("status", "pending")

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "reject") {
    const { error } = await supabaseServer
      .from("ai_action_drafts")
      .update({
        status: "rejected",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "approve") {
    try {
      const result = await approveAiActionDraft(id, user_id)
      return NextResponse.json({ ok: true, result })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro"
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
