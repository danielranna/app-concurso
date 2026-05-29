import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function DELETE(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id: question_id, entryId } = await params
  const user_id = new URL(req.url).searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data: row, error: fetchErr } = await supabaseServer
    .from("question_note_entries")
    .select("id")
    .eq("id", entryId)
    .eq("user_id", user_id)
    .eq("question_id", question_id)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: "Anotação não encontrada" }, { status: 404 })
  }

  const { error } = await supabaseServer
    .from("question_note_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
