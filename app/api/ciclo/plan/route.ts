import { NextResponse } from "next/server"
import { generateFullCycle, previewCycleStats } from "@/lib/study-cycle-deadline-planner"
import {
  activateCycle,
  getActiveOrDraftCycle,
  saveManualCycle,
} from "@/lib/study-cycle-db"
import { loadContentBlocksForCycle } from "@/lib/study-cycle-content-blocks-db"
import { defaultWeekdayLimits } from "@/lib/study-cycle-planner"
import { collectCycleSetupIssues } from "@/lib/study-cycle-setup-validation"
import type { ManualCycleSaveInput, WeekdayLimits } from "@/lib/study-cycle-types"

export async function POST(req: Request) {
  const body = await req.json()
  const {
    user_id,
    action,
    name,
    days,
    weekday_limits,
    cycle_id,
    target_weeks,
    default_block_minutes,
    planning_mode,
    subjects_per_day,
    activate: shouldActivate,
  } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (action === "preview") {
      const cycle = await getActiveOrDraftCycle(user_id)
      if (!cycle?.subjects?.length) {
        return NextResponse.json(
          { error: "Configure matérias no ciclo primeiro" },
          { status: 400 }
        )
      }
      const contentBlocks = cycle.content_blocks?.length
        ? cycle.content_blocks
        : await loadContentBlocksForCycle(cycle.id)

      const subjectPlans = cycle.subjects.map((s) => ({
        subject_id: s.subject_id,
        subject_name: s.subject_name,
        weight: s.weight ?? s.times_in_cycle ?? 1,
        blocks: contentBlocks.filter((b) => b.subject_id === s.subject_id),
      }))

      const setup_issues = collectCycleSetupIssues(subjectPlans)
      if (setup_issues.length) {
        return NextResponse.json({
          setup_issues,
          error: "Resolva os itens pendentes em Blocos antes de continuar.",
        })
      }

      const limits =
        cycle.weekday_limits?.length
          ? cycle.weekday_limits
          : (weekday_limits as WeekdayLimits[]) ?? defaultWeekdayLimits()

      const stats = previewCycleStats(
        subjectPlans,
        limits,
        Number(target_weeks ?? cycle.target_weeks ?? 8),
        Number(default_block_minutes ?? cycle.default_block_minutes ?? 45)
      )

      return NextResponse.json({ stats })
    }

    if (action === "generate" || action === "generate_and_activate") {
      const cycle = await getActiveOrDraftCycle(user_id)
      if (!cycle?.subjects?.length) {
        return NextResponse.json(
          { error: "Configure matérias no ciclo primeiro" },
          { status: 400 }
        )
      }

      const contentBlocks = cycle.content_blocks?.length
        ? cycle.content_blocks
        : await loadContentBlocksForCycle(cycle.id)

      const subjectPlans = cycle.subjects.map((s) => ({
        subject_id: s.subject_id,
        subject_name: s.subject_name,
        weight: s.weight ?? s.times_in_cycle ?? 1,
        blocks: contentBlocks.filter((b) => b.subject_id === s.subject_id),
      }))

      const setup_issues = collectCycleSetupIssues(subjectPlans)
      if (setup_issues.length) {
        return NextResponse.json(
          {
            setup_issues,
            error: "Resolva os itens pendentes em Blocos antes de gerar o calendário.",
          },
          { status: 400 }
        )
      }

      const limits =
        cycle.weekday_limits?.length
          ? cycle.weekday_limits
          : (weekday_limits as WeekdayLimits[]) ?? defaultWeekdayLimits()

      const weeks = Number(target_weeks ?? cycle.target_weeks ?? 8)
      const blockMinutes = Number(default_block_minutes ?? cycle.default_block_minutes ?? 45)

      const generated = generateFullCycle({
        subjects: subjectPlans,
        weekday_limits: limits,
        target_weeks: weeks,
        default_block_minutes: blockMinutes,
        subjects_per_day: subjects_per_day ?? cycle.subjects_per_day ?? 2,
        planning_mode: planning_mode ?? "deadline_driven",
      })

      if (!generated.stats.feasible) {
        return NextResponse.json(
          { error: generated.stats.warning ?? "Prazo inviável com tempo disponível", stats: generated.stats },
          { status: 400 }
        )
      }

      const input: ManualCycleSaveInput = {
        name: name ?? cycle.name ?? "Meu ciclo",
        weekday_limits: limits,
        planning_mode: "deadline_driven",
        target_weeks: weeks,
        default_block_minutes: blockMinutes,
        subjects: cycle.subjects.map((s, i) => ({
          subject_id: s.subject_id,
          sort_order: s.sort_order ?? i,
          weight: s.weight ?? s.times_in_cycle ?? 1,
        })),
        days: generated.days,
      }

      const saved = await saveManualCycle(user_id, input)

      if (action === "generate_and_activate" || shouldActivate) {
        const active = await activateCycle(user_id, saved.id)
        return NextResponse.json({
          cycle: active,
          stats: generated.stats,
          cycle_enabled: true,
        })
      }

      return NextResponse.json({ cycle: saved, stats: generated.stats })
    }

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
        planning_mode: planning_mode ?? "time_driven",
        target_weeks,
        default_block_minutes,
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
                content_block_id: b.content_block_id ?? null,
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

  const { supabaseServer } = await import("@/lib/supabase-server")

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
