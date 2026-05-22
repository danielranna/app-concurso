import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data: session, error } = await supabaseServer
    .from("study_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user_id)
    .single()

  if (error || !session) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })
  }

  const queue = (session.queue ?? []) as {
    question_id: string
    tec_id: number
    notebook_id: string
    position: number
  }[]

  const answered = new Set(session.answered_tec_ids ?? [])
  const pending = queue.filter((q) => !answered.has(q.tec_id))
  const current = pending[0] ?? null

  let question = null
  let options: unknown[] = []
  if (current) {
    const { data: q } = await supabaseServer
      .from("questions")
      .select("*")
      .eq("id", current.question_id)
      .single()
    question = q
    const { data: opts } = await supabaseServer
      .from("question_options")
      .select("*")
      .eq("question_id", current.question_id)
      .order("sort_order")
    options = opts ?? []
  }

  const { data: childProgress } = await supabaseServer
    .from("study_session_notebooks")
    .select("*, notebooks(name)")
    .eq("study_session_id", id)

  const resolved = (session.answered_tec_ids ?? []).length

  return NextResponse.json({
    session,
    current,
    question,
    options,
    stats: {
      total: queue.length,
      resolved,
      pending: pending.length,
    },
    child_progress: childProgress ?? [],
  })
}
