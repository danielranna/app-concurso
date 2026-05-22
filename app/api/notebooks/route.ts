import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")
  const folder_id = searchParams.get("folder_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  let query = supabaseServer
    .from("notebooks")
    .select("*")
    .eq("user_id", user_id)
    .order("last_accessed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (searchParams.get("unassigned") === "1") query = query.is("subject_id", null)
  else if (subject_id) query = query.eq("subject_id", subject_id)
  if (folder_id) query = query.eq("folder_id", folder_id)
  if (searchParams.get("root_only") === "1") query = query.is("folder_id", null)
  if (searchParams.get("root_only") === "1") query = query.is("folder_id", null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, name, subject_id, folder_id, share_url } = body
  if (!user_id || !name) {
    return NextResponse.json({ error: "user_id e name obrigatórios" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("notebooks")
    .insert({
      user_id,
      name,
      subject_id: subject_id ?? null,
      folder_id: folder_id ?? null,
      share_url: share_url ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
