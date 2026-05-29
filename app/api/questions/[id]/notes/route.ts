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

  const { data, error } = await supabaseServer
    .from("question_note_entries")
    .select("id, body, created_at, ai_processed_at, ai_feedback")
    .eq("user_id", user_id)
    .eq("question_id", question_id)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const entries = (data ?? []).map((row) => ({
    id: row.id as string,
    body: row.body as string,
    created_at: row.created_at as string,
    has_ai_response: Boolean(row.ai_processed_at && row.ai_feedback),
  }))

  return NextResponse.json({ entries })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: question_id } = await params
  const body = await req.json()
  const { user_id, body: noteBody } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const trimmed = String(noteBody ?? "").trim()
  if (!trimmed) {
    return NextResponse.json({ error: "Escreva algo antes de enviar" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("question_note_entries")
    .insert({
      user_id,
      question_id,
      body: trimmed,
    })
    .select("id, body, created_at, ai_processed_at, ai_feedback")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    entry: {
      id: data.id,
      body: data.body,
      created_at: data.created_at,
      has_ai_response: false,
    },
  })
}
