import { NextResponse } from "next/server"
import { previewCycleStats } from "@/lib/study-cycle-deadline-planner"
import {
  getActiveOrDraftCycle,
  getCyclePreferences,
} from "@/lib/study-cycle-db"
import { loadContentBlocksForCycle } from "@/lib/study-cycle-content-blocks-db"
import { defaultWeekdayLimits } from "@/lib/study-cycle-planner"
import {
  renderStudyCyclePdfBuffer,
  studyCyclePdfFilename,
} from "@/lib/study-cycle-pdf-report"
import { enrichCycleDays } from "@/lib/study-cycle-week-utils"
import type { WeekdayLimits } from "@/lib/study-cycle-types"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const [cycleRaw, prefs] = await Promise.all([
      getActiveOrDraftCycle(user_id),
      getCyclePreferences(user_id),
    ])

    if (!cycleRaw?.subjects?.length) {
      return NextResponse.json(
        { error: "Configure matérias no ciclo primeiro" },
        { status: 400 }
      )
    }

    const contentBlocks = cycleRaw.content_blocks?.length
      ? cycleRaw.content_blocks
      : await loadContentBlocksForCycle(cycleRaw.id)

    const targetWeeks = Number(
      searchParams.get("target_weeks") ?? cycleRaw.target_weeks ?? 8
    )
    const blockMinutes = Number(
      searchParams.get("default_block_minutes") ??
        cycleRaw.default_block_minutes ??
        45
    )

    const limits: WeekdayLimits[] = cycleRaw.weekday_limits?.length
      ? cycleRaw.weekday_limits
      : defaultWeekdayLimits()

    const subjectPlans = cycleRaw.subjects.map((s) => ({
      subject_id: s.subject_id,
      subject_name: s.subject_name,
      weight: s.weight ?? s.times_in_cycle ?? 1,
      blocks: contentBlocks.filter((b) => b.subject_id === s.subject_id),
    }))

    const stats =
      cycleRaw.planning_mode === "deadline_driven" ||
      !cycleRaw.planning_mode
        ? previewCycleStats(subjectPlans, limits, targetWeeks, blockMinutes)
        : null

    const cycle = enrichCycleDays({
      ...cycleRaw,
      content_blocks: contentBlocks,
      target_weeks: targetWeeks,
      default_block_minutes: blockMinutes,
    })

    const generatedAt = new Date()
    const pdfBuffer = await renderStudyCyclePdfBuffer({
      cycle,
      stats,
      cycleEnabled: prefs.cycle_enabled ?? false,
      generatedAt,
    })

    const filename = studyCyclePdfFilename(cycle, generatedAt)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gerar PDF"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
