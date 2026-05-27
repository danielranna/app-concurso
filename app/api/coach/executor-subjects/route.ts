import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  getEditalSubjectIdSet,
  getExecutorStudyPreferences,
  getSubjectIdsWithAttempts,
  mergeEditalIntoAllowlist,
  seedExecutorAllowlistIfEmpty,
} from "@/lib/ai/execution-subjects"
import { buildSubjectPriorityMap } from "@/lib/ai/strategy-helpers"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const sync_edital = searchParams.get("sync_edital") === "1"

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (sync_edital) {
      await mergeEditalIntoAllowlist(user_id)
    }

    const allowlist = await seedExecutorAllowlistIfEmpty(user_id)
    const editalIds = await getEditalSubjectIdSet(user_id)
    const attemptedIds = await getSubjectIdsWithAttempts(user_id)
    const prefs = await getExecutorStudyPreferences(user_id)

    const { data: subjects } = await supabaseServer
      .from("subjects")
      .select("id, name")
      .eq("user_id", user_id)
      .order("name")

    const { data: queue } = await supabaseServer
      .from("strategic_queue_items")
      .select("subject_id, priority_score")
      .eq("user_id", user_id)

    const priorityMap = buildSubjectPriorityMap(
      (queue ?? []).map((q) => ({
        subject_id: q.subject_id,
        priority_score: Number(q.priority_score),
      }))
    )

    const items = (subjects ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      in_edital: editalIds.has(s.id),
      in_executor: allowlist.includes(s.id),
      has_attempts: attemptedIds.has(s.id),
      subject_priority: priorityMap[s.id] ?? 0,
      eligible: allowlist.includes(s.id) && attemptedIds.has(s.id),
    }))

    return NextResponse.json({
      items,
      allowlist,
      preferences: {
        question_distribution_mode: prefs.question_distribution_mode,
        questions_per_subject_round: prefs.questions_per_subject_round,
        rotate_subjects: prefs.rotate_subjects,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const {
    user_id,
    executor_subject_ids,
    question_distribution_mode,
    questions_per_subject_round,
    sync_edital,
  } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    let ids = executor_subject_ids as string[] | undefined
    if (sync_edital) {
      ids = await mergeEditalIntoAllowlist(user_id)
    }

    const patch: Record<string, unknown> = {
      user_id,
      updated_at: new Date().toISOString(),
    }
    if (ids) patch.executor_subject_ids = ids
    if (question_distribution_mode) {
      patch.question_distribution_mode = question_distribution_mode
    }
    if (questions_per_subject_round != null) {
      patch.questions_per_subject_round = Number(questions_per_subject_round)
    }

    const current = await getExecutorStudyPreferences(user_id)
    await supabaseServer.from("coach_study_preferences").upsert({
      study_mode: current.study_mode,
      daily_limits: current.daily_limits,
      rotate_subjects: current.rotate_subjects,
      executor_subject_ids: current.executor_subject_ids,
      question_distribution_mode: current.question_distribution_mode,
      questions_per_subject_round: current.questions_per_subject_round,
      ...patch,
    })

    return NextResponse.json({ ok: true, executor_subject_ids: ids })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
