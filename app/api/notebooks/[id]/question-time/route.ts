import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebook_id } = await params
  const body = await req.json().catch(() => ({}))
  const user_id = String(body.user_id || "").trim()
  const question_id = String(body.question_id || "").trim()
  const subtract_ms = Math.max(0, Math.floor(Number(body.subtract_ms) || 0))

  if (!user_id || !question_id) {
    return NextResponse.json({ error: "user_id e question_id obrigatórios" }, { status: 400 })
  }

  const { data: nb } = await supabaseServer
    .from("notebooks")
    .select("id, study_elapsed_ms")
    .eq("id", notebook_id)
    .eq("user_id", user_id)
    .maybeSingle()

  if (!nb) {
    return NextResponse.json({ error: "Caderno não encontrado" }, { status: 404 })
  }

  const { data: attempt } = await supabaseServer
    .from("question_attempts")
    .select("id")
    .eq("notebook_id", notebook_id)
    .eq("user_id", user_id)
    .eq("question_id", question_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (attempt?.id) {
    const { error: attErr } = await supabaseServer
      .from("question_attempts")
      .update({ duration_ms: 0 })
      .eq("id", attempt.id)
    if (attErr) {
      return NextResponse.json({ error: attErr.message }, { status: 500 })
    }
  }

  const nextElapsed = Math.max(0, Number(nb.study_elapsed_ms ?? 0) - subtract_ms)
  const { error: nbErr } = await supabaseServer
    .from("notebooks")
    .update({
      study_elapsed_ms: nextElapsed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notebook_id)

  if (nbErr) {
    return NextResponse.json({ error: nbErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    subtracted_ms: subtract_ms,
    study_elapsed_ms: nextElapsed,
  })
}
