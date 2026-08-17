import { NextResponse } from "next/server"
import { requireAuthUser, requireTutorialManager } from "@/lib/tutorial-permissions"
import { supabaseServer } from "@/lib/supabase-server"
import { sanitizeTutorialSearch } from "@/lib/tutorials"

export async function GET(req: Request) {
  const auth = await requireAuthUser(req)
  if (!auth.user) return auth.response

  const { searchParams } = new URL(req.url)
  const q = sanitizeTutorialSearch(searchParams.get("q") ?? "")

  let query = supabaseServer
    .from("tutorials")
    .select("*")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tutorials: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireTutorialManager(req)
  if (!auth.user) return auth.response

  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? "").trim()
  const description = String(body.description ?? "").trim()
  const video_path = String(body.video_path ?? "").trim()
  const video_url = String(body.video_url ?? "").trim()
  const thumbnail_path = body.thumbnail_path ? String(body.thumbnail_path).trim() : null
  const thumbnail_url = body.thumbnail_url ? String(body.thumbnail_url).trim() : null
  const status = body.status === "draft" ? "draft" : "published"

  if (!title || !description || !video_path || !video_url) {
    return NextResponse.json(
      { error: "Título, descrição e vídeo são obrigatórios" },
      { status: 400 }
    )
  }

  const { data: last } = await supabaseServer
    .from("tutorials")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (last?.sort_order ?? -1) + 1

  const { data, error } = await supabaseServer
    .from("tutorials")
    .insert([
      {
        title,
        description,
        video_path,
        video_url,
        thumbnail_path,
        thumbnail_url,
        author_id: auth.user.id,
        author_email: auth.user.email ?? null,
        status,
        sort_order,
      },
    ])
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tutorial: data })
}
