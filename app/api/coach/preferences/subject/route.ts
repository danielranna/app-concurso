import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "user_id e subject_id obrigatórios" },
      { status: 400 }
    )
  }

  const [{ data: global }, { data: subject }] = await Promise.all([
    supabaseServer
      .from("coach_report_preferences")
      .select("explain_wrong")
      .eq("user_id", user_id)
      .maybeSingle(),
    supabaseServer
      .from("coach_subject_report_preferences")
      .select("explain_wrong")
      .eq("user_id", user_id)
      .eq("subject_id", subject_id)
      .maybeSingle(),
  ])

  return NextResponse.json({
    global_explain_wrong: global?.explain_wrong ?? true,
    explain_wrong: subject?.explain_wrong ?? null,
    effective_explain_wrong:
      subject?.explain_wrong !== undefined && subject?.explain_wrong !== null
        ? subject.explain_wrong
        : (global?.explain_wrong ?? true),
  })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { user_id, subject_id, explain_wrong } = body as {
    user_id: string
    subject_id: string
    explain_wrong: boolean | null
  }

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "user_id e subject_id obrigatórios" },
      { status: 400 }
    )
  }

  if (explain_wrong === null) {
    await supabaseServer
      .from("coach_subject_report_preferences")
      .delete()
      .eq("user_id", user_id)
      .eq("subject_id", subject_id)
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabaseServer.from("coach_subject_report_preferences").upsert({
    user_id,
    subject_id,
    explain_wrong,
    updated_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
