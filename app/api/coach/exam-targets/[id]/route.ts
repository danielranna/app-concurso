import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { user_id, set_active, ...fields } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  if (set_active) {
    await supabaseServer
      .from("exam_targets")
      .update({ is_active: false })
      .eq("user_id", user_id)
  }

  const update: Record<string, unknown> = { ...fields }
  if (set_active) update.is_active = true

  const { data, error } = await supabaseServer
    .from("exam_targets")
    .update(update)
    .eq("id", id)
    .eq("user_id", user_id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { error } = await supabaseServer
    .from("exam_targets")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
