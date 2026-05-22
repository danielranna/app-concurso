import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { error } = await supabaseServer
    .from("study_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
