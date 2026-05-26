import { supabaseServer } from "../supabase-server"
import { buildSubjectPriorityMap } from "./strategy-helpers"
import type { SubjectBrainState } from "../coach-types"
import { buildNotebookReportSnapshot } from "./notebook-report"
import { getTopicStatsForSubject } from "../learning-signals"

export async function getReportPreferences(userId: string) {
  const { data } = await supabaseServer
    .from("coach_report_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  const teacherDailyCap =
    data?.max_teacher_queries_per_day ??
    data?.max_llm_explanations_per_day ??
    30

  return {
    explain_wrong: data?.explain_wrong ?? true,
    classify_all_wrong: data?.classify_all_wrong ?? true,
    max_llm_explanations_per_day: data?.max_llm_explanations_per_day ?? 15,
    max_teacher_queries_per_day: teacherDailyCap,
    teacher_daily_cap: teacherDailyCap,
  }
}

export async function getEffectiveReportPreferences(
  userId: string,
  subjectId?: string | null
) {
  const global = await getReportPreferences(userId)
  if (!subjectId) return global

  const { data: subjectRow } = await supabaseServer
    .from("coach_subject_report_preferences")
    .select("explain_wrong")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .maybeSingle()

  const explain_wrong =
    subjectRow?.explain_wrong !== undefined && subjectRow?.explain_wrong !== null
      ? subjectRow.explain_wrong
      : global.explain_wrong

  return { ...global, explain_wrong }
}

export async function getTeacherDailyCap(userId: string): Promise<number> {
  const prefs = await getReportPreferences(userId)
  return prefs.teacher_daily_cap
}

export async function getStudyPreferences(userId: string) {
  const { data } = await supabaseServer
    .from("coach_study_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  return {
    study_mode: (data?.study_mode ?? "pre_edital") as
      | "pre_edital"
      | "pos_edital"
      | "reta_final",
    daily_limits: (data?.daily_limits ?? {
      questions: 50,
      flashcards: 20,
      summaries: 2,
      error_reviews: 10,
    }) as Record<string, number>,
    rotate_subjects: data?.rotate_subjects ?? true,
  }
}

export async function loadSubjectBrain(
  userId: string,
  subjectId: string
): Promise<SubjectBrainState | null> {
  const { data } = await supabaseServer
    .from("subject_brain_state")
    .select("state")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .maybeSingle()

  return (data?.state as SubjectBrainState) ?? null
}

export async function buildReportContext(
  userId: string,
  notebookId: string,
  subjectId: string | null
) {
  const snapshot = await buildNotebookReportSnapshot(notebookId, userId)
  const prefs = await getReportPreferences(userId)
  const brain = subjectId ? await loadSubjectBrain(userId, subjectId) : null

  return { snapshot, prefs, brain }
}

export async function buildBrainContext(userId: string, subjectId: string) {
  const topicStats = await getTopicStatsForSubject(userId, subjectId)
  const brain = await loadSubjectBrain(userId, subjectId)

  const { data: latestReport } = await supabaseServer
    .from("subject_notebook_reports")
    .select("id, structured, created_at")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    topic_stats: topicStats,
    previous_brain: brain,
    latest_report: latestReport?.structured ?? null,
    report_id: latestReport?.id,
  }
}

export async function buildStrategyContext(userId: string, subjectId?: string) {
  let query = supabaseServer
    .from("strategic_queue_items")
    .select("*")
    .eq("user_id", userId)
    .order("priority_score", { ascending: false })
    .limit(30)

  if (subjectId) query = query.eq("subject_id", subjectId)

  const { data: queue } = await query

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)

  return {
    queue: queue ?? [],
    subjects: subjects ?? [],
  }
}

export async function buildExecutionContext(userId: string) {
  const prefs = await getStudyPreferences(userId)
  const today = new Date().toISOString().slice(0, 10)

  const { data: existingPlan } = await supabaseServer
    .from("daily_study_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", today)
    .maybeSingle()

  const { data: queue } = await supabaseServer
    .from("strategic_queue_items")
    .select("*")
    .eq("user_id", userId)
    .order("priority_score", { ascending: false })
    .limit(40)

  const { count: dueCards } = await supabaseServer
    .from("flashcard_states")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due_at", new Date().toISOString())

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)

  const { data: yesterdayPlan } = await supabaseServer
    .from("daily_study_plans")
    .select("blocks")
    .eq("user_id", userId)
    .lt("plan_date", today)
    .order("plan_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  const yesterdaySubjects = new Set(
    ((yesterdayPlan?.blocks as { subject_id?: string }[]) ?? [])
      .map((b) => b.subject_id)
      .filter(Boolean)
  )

  let completed_block_keys: string[] = []
  if (existingPlan?.id) {
    const { data: completions } = await supabaseServer
      .from("plan_block_completions")
      .select("block_key")
      .eq("plan_id", existingPlan.id)

    completed_block_keys = (completions ?? []).map((c) => c.block_key)
  }

  const queueRows = queue ?? []
  const subject_priority_map = buildSubjectPriorityMap(
    queueRows.map((q) => ({
      subject_id: q.subject_id,
      priority_score: Number(q.priority_score),
    }))
  )

  return {
    prefs,
    today,
    existing_plan: existingPlan,
    queue: queueRows,
    subject_priority_map,
    subjects: subjects ?? [],
    flashcards_due: dueCards ?? 0,
    yesterday_subject_ids: [...yesterdaySubjects],
    completed_block_keys,
  }
}
