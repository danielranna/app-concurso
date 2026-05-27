import { NextResponse } from "next/server"
import { userHasAiCredentials } from "@/lib/ai/user-credentials"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const [
    { count: pendingDrafts },
    { count: pendingReports },
    { data: pendingReportNotebooks },
    { data: activeExam },
    { data: recentReports },
  ] = await Promise.all([
    supabaseServer
      .from("ai_action_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("status", "pending"),
    supabaseServer
      .from("notebooks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("report_pending", true),
    supabaseServer
      .from("notebooks")
      .select("id, name, completed_at")
      .eq("user_id", user_id)
      .eq("report_pending", true)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(8),
    supabaseServer
      .from("exam_targets")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true)
      .maybeSingle(),
    supabaseServer
      .from("subject_notebook_reports")
      .select("id, notebook_id, summary_md, created_at, structured, model_used")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  const aiConfigured = await userHasAiCredentials(user_id)

  return NextResponse.json({
    pending_drafts: pendingDrafts ?? 0,
    pending_reports: pendingReports ?? 0,
    pending_report_notebooks: pendingReportNotebooks ?? [],
    active_exam: activeExam,
    recent_reports: recentReports ?? [],
    report_mode: aiConfigured ? "llm" : "rules",
    ai_configured: aiConfigured,
  })
}
