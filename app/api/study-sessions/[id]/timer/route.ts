import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { user_id, study_elapsed_ms } = body

  if (!user_id || study_elapsed_ms == null) {
    return NextResponse.json({ error: "user_id e study_elapsed_ms obrigatórios" }, { status: 400 })
  }

  const { error } = await supabaseServer
    .from("study_sessions")
    .update({
      study_elapsed_ms: Math.max(0, Math.floor(study_elapsed_ms)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
