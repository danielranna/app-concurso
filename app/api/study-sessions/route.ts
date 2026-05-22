import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { buildCombinedQueue } from "@/lib/question-study"

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("study_sessions")
    .select("*")
    .eq("user_id", user_id)
    .order("updated_at", { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, name, notebook_ids, shuffle = true } = body

  if (!user_id || !name || !notebook_ids?.length) {
    return NextResponse.json(
      { error: "user_id, name e notebook_ids obrigatórios" },
      { status: 400 }
    )
  }

  const queue = await buildCombinedQueue(notebook_ids, user_id, shuffle)

  const { data: session, error } = await supabaseServer
    .from("study_sessions")
    .insert({
      user_id,
      name,
      shuffle,
      queue,
      status: "in_progress",
      current_index: 0,
      answered_tec_ids: [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const nbId of notebook_ids) {
    const { count } = await supabaseServer
      .from("notebook_questions")
      .select("id", { count: "exact", head: true })
      .eq("notebook_id", nbId)

    await supabaseServer.from("study_session_notebooks").insert({
      study_session_id: session.id,
      notebook_id: nbId,
      total: count ?? 0,
      answered: 0,
    })
  }

  return NextResponse.json({ session, queue_length: queue.length })
}
