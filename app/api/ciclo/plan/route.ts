import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  activateCycle,
  getSubjectBrainScores,
  previewCyclePlan,
  saveCycleDraft,
} from "@/lib/study-cycle-db"
import { defaultWeekdayLimits } from "@/lib/study-cycle-planner"
import type { WeekdayLimits } from "@/lib/study-cycle-types"

export async function POST(req: Request) {
  const body = await req.json()
  const {
    user_id,
    action,
    subject_ids,
    subjects_per_day,
    weekday_limits,
    plan,
    subjects_doubled,
    name,
    cycle_id,
  } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (action === "preview") {
      if (!Array.isArray(subject_ids) || !subject_ids.length) {
        return NextResponse.json(
          { error: "Selecione ao menos uma matéria" },
          { status: 400 }
        )
      }
      const brainScores = await getSubjectBrainScores(user_id, subject_ids)
      const result = await previewCyclePlan(user_id, {
        subject_ids,
        subjects_per_day: Number(subjects_per_day ?? 2),
        weekday_limits: weekday_limits as WeekdayLimits[] | undefined,
        subject_brain_scores: brainScores,
      })
      return NextResponse.json({ plan: result, subject_brain_scores: brainScores })
    }

    if (action === "save") {
      if (!plan?.days?.length) {
        return NextResponse.json({ error: "Plano inválido" }, { status: 400 })
      }
      const cycle = await saveCycleDraft(user_id, {
        name,
        subjects_per_day: Number(subjects_per_day ?? 2),
        subject_ids: subject_ids ?? [],
        weekday_limits: (weekday_limits as WeekdayLimits[]) ?? defaultWeekdayLimits(),
        plan,
        subjects_doubled,
      })
      return NextResponse.json({ cycle })
    }

    if (action === "save_and_activate") {
      if (!plan?.days?.length) {
        return NextResponse.json({ error: "Plano inválido" }, { status: 400 })
      }
      const cycle = await saveCycleDraft(user_id, {
        name,
        subjects_per_day: Number(subjects_per_day ?? 2),
        subject_ids: subject_ids ?? [],
        weekday_limits: (weekday_limits as WeekdayLimits[]) ?? defaultWeekdayLimits(),
        plan,
        subjects_doubled,
      })
      const active = await activateCycle(user_id, cycle.id)
      return NextResponse.json({ cycle: active, cycle_enabled: true })
    }

    if (action === "activate" && cycle_id) {
      const active = await activateCycle(user_id, cycle_id)
      return NextResponse.json({ cycle: active, cycle_enabled: true })
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { user_id, subjects_per_cycle_day, weekday_limits, cycle_id } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  if (subjects_per_cycle_day != null) {
    await supabaseServer.from("coach_study_preferences").upsert({
      user_id,
      subjects_per_cycle_day: Number(subjects_per_cycle_day),
      updated_at: new Date().toISOString(),
    })
  }

  if (weekday_limits && cycle_id) {
    for (const w of weekday_limits as WeekdayLimits[]) {
      await supabaseServer
        .from("study_cycle_weekday_limits")
        .upsert(
          {
            cycle_id,
            weekday: w.weekday,
            minutes: w.minutes,
            active: w.active,
            daily_limits: w.daily_limits,
          },
          { onConflict: "cycle_id,weekday" }
        )
    }
  }

  return NextResponse.json({ ok: true })
}
