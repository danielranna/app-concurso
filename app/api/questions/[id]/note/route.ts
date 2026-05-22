import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: question_id } = await params
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data } = await supabaseServer
    .from("question_notes")
    .select("*")
    .eq("user_id", user_id)
    .eq("question_id", question_id)
    .maybeSingle()

  return NextResponse.json(data ?? { note: "" })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: question_id } = await params
  const body = await req.json()
  const { user_id, note } = body
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("question_notes")
    .upsert(
      {
        user_id,
        question_id,
        note: note ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,question_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
