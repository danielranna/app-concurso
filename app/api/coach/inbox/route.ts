import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { approveAiActionDraft } from "@/lib/ai-action-approve"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const status = searchParams.get("status") ?? "pending"

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("ai_action_drafts")
    .select("*")
    .eq("user_id", user_id)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const {
    user_id,
    type,
    label,
    payload,
    subject_id,
    exam_target_id,
    source_agent,
  } = body

  if (!user_id || !type || !label) {
    return NextResponse.json(
      { error: "user_id, type e label obrigatórios" },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseServer
    .from("ai_action_drafts")
    .insert({
      user_id,
      type,
      label,
      payload: payload ?? {},
      subject_id: subject_id ?? null,
      exam_target_id: exam_target_id ?? null,
      source_agent: source_agent ?? "manual",
      status: "pending",
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
