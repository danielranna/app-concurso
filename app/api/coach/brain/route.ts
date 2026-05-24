import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import type { SubjectBrainState } from "@/lib/coach-types"

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

  const { data, error } = await supabaseServer
    .from("subject_brain_state")
    .select("state, summary_md, updated_at, last_report_id")
    .eq("user_id", user_id)
    .eq("subject_id", subject_id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    state: (data?.state as SubjectBrainState) ?? null,
    summary_md: data?.summary_md,
    updated_at: data?.updated_at,
  })
}
