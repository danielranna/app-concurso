import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  activateCycle,
  saveManualCycle,
} from "@/lib/study-cycle-db"
import { defaultWeekdayLimits } from "@/lib/study-cycle-planner"
import type { ManualCycleSaveInput, WeekdayLimits } from "@/lib/study-cycle-types"

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, action, name, days, weekday_limits, cycle_id } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (action === "save" || action === "save_and_activate") {
      if (!Array.isArray(days) || !days.length) {
        return NextResponse.json(
          { error: "Adicione ao menos um dia com blocos" },
          { status: 400 }
        )
      }

      const input: ManualCycleSaveInput = {
        name,
        weekday_limits: (weekday_limits as WeekdayLimits[]) ?? defaultWeekdayLimits(),
        days: days.map(
          (
            d: {
              day_index: number
              weekday?: number | null
              blocks: ManualCycleSaveInput["days"][0]["blocks"]
            },
            i: number
          ) => ({
            day_index: d.day_index ?? i,
            weekday: d.weekday ?? null,
            blocks: (d.blocks ?? []).map(
              (
                b: ManualCycleSaveInput["days"][0]["blocks"][0],
                sort_order: number
              ) => ({
                day_index: d.day_index ?? i,
                subject_id: b.subject_id,
                content_node_id: b.content_node_id ?? null,
                block_type: b.block_type,
                sort_order,
                label: b.label ?? "",
                params: b.params ?? {},
              })
            ),
          })
        ),
      }

      const cycle = await saveManualCycle(user_id, input)

      if (action === "save_and_activate") {
        const active = await activateCycle(user_id, cycle.id)
        return NextResponse.json({ cycle: active, cycle_enabled: true })
      }

      return NextResponse.json({ cycle })
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
      await supabaseServer.from("study_cycle_weekday_limits").upsert(
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
