import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const [{ data: report }, { data: study }] = await Promise.all([
    supabaseServer
      .from("coach_report_preferences")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle(),
    supabaseServer
      .from("coach_study_preferences")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle(),
  ])

  return NextResponse.json({
    report: report ?? {
      explain_wrong: true,
      classify_all_wrong: true,
      max_llm_explanations_per_day: 15,
    },
    study: study ?? {
      study_mode: "pre_edital",
      daily_limits: { questions: 50, flashcards: 20, summaries: 2, error_reviews: 10 },
      rotate_subjects: true,
      executor_subject_ids: [],
      question_distribution_mode: "fixed_per_subject",
      questions_per_subject_round: 5,
      cycle_enabled: false,
      cycle_paused_at: null,
      subjects_per_cycle_day: 2,
    },
  })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { user_id, report, study } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  if (report) {
    await supabaseServer.from("coach_report_preferences").upsert({
      user_id,
      ...report,
      updated_at: new Date().toISOString(),
    })
  }

  if (study) {
    await supabaseServer.from("coach_study_preferences").upsert({
      user_id,
      ...study,
      updated_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ ok: true })
}
