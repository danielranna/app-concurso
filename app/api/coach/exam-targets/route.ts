import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("exam_targets")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, name, banca, orgao, cargo, year, set_active } = body

  if (!user_id || !name) {
    return NextResponse.json(
      { error: "user_id e name obrigatórios" },
      { status: 400 }
    )
  }

  if (set_active) {
    await supabaseServer
      .from("exam_targets")
      .update({ is_active: false })
      .eq("user_id", user_id)
  }

  const { data, error } = await supabaseServer
    .from("exam_targets")
    .insert({
      user_id,
      name,
      banca: banca ?? null,
      orgao: orgao ?? null,
      cargo: cargo ?? null,
      year: year ?? null,
      is_active: !!set_active,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
