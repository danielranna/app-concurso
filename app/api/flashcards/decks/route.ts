import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("flashcard_decks")
    .select("id, name, subject_id, fsrs_parameters, created_at")
    .eq("user_id", user_id)
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, name, subject_id, fsrs_parameters } = body

  if (!user_id || !name?.trim()) {
    return NextResponse.json({ error: "user_id e name são obrigatórios" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("flashcard_decks")
    .insert({
      user_id,
      name: name.trim(),
      subject_id: subject_id ?? null,
      fsrs_parameters: fsrs_parameters ?? {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
