import { NextResponse } from "next/server"
import { recomputeStrategicQueue, recomputeAllSubjectsQueue } from "@/lib/ai/strategic-queue"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  let query = supabaseServer
    .from("strategic_queue_items")
    .select("*")
    .eq("user_id", user_id)
    .order("priority_score", { ascending: false })
    .limit(50)

  if (subject_id) query = query.eq("subject_id", subject_id)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, subject_id, all_subjects } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (all_subjects) {
      const rows = await recomputeAllSubjectsQueue(user_id)
      return NextResponse.json({ recomputed: rows.length })
    }
    if (!subject_id) {
      return NextResponse.json({ error: "subject_id obrigatório" }, { status: 400 })
    }
    const rows = await recomputeStrategicQueue(user_id, subject_id, {
      withLlmNarrative: Boolean(body.with_llm),
    })
    return NextResponse.json({ items: rows })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
