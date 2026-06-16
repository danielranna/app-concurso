import { NextResponse } from "next/server"
import {
  activateCycle,
  getActiveCycle,
  getCycleById,
  getCyclePreferences,
  getSubjectIdsWithNotebooks,
  pauseCycle,
  resolveCycleForUser,
  resumeCycle,
} from "@/lib/study-cycle-db"
import { detectSetupDrift, listUserCyclePlans } from "@/lib/study-cycle-plans"
import { resolvePrioritySource, PRIORITY_SOURCE_LABELS } from "@/lib/priority-source"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const cycle_id = searchParams.get("cycle_id")

  const [prefs, cycle, defaultSubjectIds, plans] = await Promise.all([
    getCyclePreferences(user_id),
    resolveCycleForUser(user_id, cycle_id),
    getSubjectIdsWithNotebooks(user_id),
    listUserCyclePlans(user_id),
  ])

  const activeCycle = await getActiveCycle(user_id)
  const drift = cycle ? await detectSetupDrift(cycle) : null

  const prioritySource = resolvePrioritySource(prefs.study_mode)

  return NextResponse.json({
    preferences: prefs,
    cycle,
    active_cycle_id: activeCycle?.id ?? null,
    plans,
    drift,
    default_subject_ids: defaultSubjectIds,
    priority_source: prioritySource,
    priority_source_label: PRIORITY_SOURCE_LABELS[prioritySource],
  })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { user_id, action, cycle_id } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (action === "pause") {
      await pauseCycle(user_id, cycle_id)
      return NextResponse.json({ ok: true, cycle_enabled: false })
    }
    if (action === "resume") {
      const cycle = await resumeCycle(user_id, cycle_id)
      return NextResponse.json({ ok: true, cycle_enabled: true, cycle })
    }
    if (action === "activate") {
      if (!cycle_id) {
        return NextResponse.json({ error: "cycle_id obrigatório" }, { status: 400 })
      }
      const cycle = await activateCycle(user_id, cycle_id)
      return NextResponse.json({ ok: true, cycle_enabled: true, cycle })
    }
    return NextResponse.json({ error: "action inválida" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
