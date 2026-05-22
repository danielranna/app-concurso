import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")
  const parent_id = searchParams.get("parent_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  let query = supabaseServer
    .from("notebook_folders")
    .select("*")
    .eq("user_id", user_id)
    .order("name")

  if (subject_id) query = query.eq("subject_id", subject_id)
  if (parent_id) query = query.eq("parent_id", parent_id)
  else if (searchParams.get("root_only") === "1") query = query.is("parent_id", null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const folders = data ?? []
  const withCounts = await Promise.all(
    folders.map(async (f) => {
      const { count: nbCount } = await supabaseServer
        .from("notebooks")
        .select("id", { count: "exact", head: true })
        .eq("folder_id", f.id)
      const { count: subCount } = await supabaseServer
        .from("notebook_folders")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", f.id)
      return {
        ...f,
        notebook_count: nbCount ?? 0,
        subfolder_count: subCount ?? 0,
      }
    })
  )

  return NextResponse.json(withCounts)
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, name, subject_id, parent_id } = body
  if (!user_id || !name) {
    return NextResponse.json({ error: "user_id e name obrigatórios" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("notebook_folders")
    .insert({
      user_id,
      name,
      subject_id: subject_id ?? null,
      parent_id: parent_id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: Request) {
  const body = await req.json()
  const { id, name } = body
  if (!id || !name) {
    return NextResponse.json({ error: "id e name obrigatórios" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("notebook_folders")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  const { error } = await supabaseServer.from("notebook_folders").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
