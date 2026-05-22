import { NextResponse } from "next/server"
import { buildNotebookQueue } from "@/lib/question-study"
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

  await supabaseServer
    .from("notebooks")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", id)

  try {
    const queue = await buildNotebookQueue(id, user_id)
    const { data: attempts } = await supabaseServer
      .from("question_attempts")
      .select("question_id, is_correct")
      .eq("user_id", user_id)
      .eq("notebook_id", id)

    const resolvedIds = new Set((attempts ?? []).map((a) => a.question_id))
    const correct = (attempts ?? []).filter((a) => a.is_correct).length
    const wrong = (attempts ?? []).length - correct

    const { data: nb } = await supabaseServer
      .from("notebooks")
      .select("question_count, name")
      .eq("id", id)
      .single()

    const first = queue[0] ?? null
    let question = null
    let options: unknown[] = []
    if (first) {
      const { data: q } = await supabaseServer
        .from("questions")
        .select("*")
        .eq("id", first.question_id)
        .single()
      question = q
      const { data: opts } = await supabaseServer
        .from("question_options")
        .select("*")
        .eq("question_id", first.question_id)
        .order("sort_order")
      options = opts ?? []
    }

    return NextResponse.json({
      queue,
      current: first,
      question,
      options,
      stats: {
        total: nb?.question_count ?? 0,
        resolved: resolvedIds.size,
        correct,
        wrong,
        pending: queue.length,
      },
      notebook: nb,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    )
  }
}
