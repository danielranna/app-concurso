import { NextResponse } from "next/server"
import {
  activateCycle,
  getCycleById,
  resolveCycleForUser,
} from "@/lib/study-cycle-db"
import {
  appendNewSessions,
  archiveCyclePlan,
  createEmptyCyclePlan,
  detectSetupDrift,
  duplicateCyclePlan,
  listUserCyclePlans,
  pauseCyclePlan,
  renameCyclePlan,
  syncScheduleFromContent,
} from "@/lib/study-cycle-plans"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const cycle_id = searchParams.get("cycle_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (cycle_id) {
      const cycle = await getCycleById(user_id, cycle_id)
      if (!cycle) {
        return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 })
      }
      const drift = await detectSetupDrift(cycle)
      return NextResponse.json({ cycle, drift })
    }

    const plans = await listUserCyclePlans(user_id)
    return NextResponse.json({ plans })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, action, name, description, duplicate_from_id } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (action === "create") {
      const id = await createEmptyCyclePlan(user_id, name ?? "Novo plano", description)
      const cycle = await getCycleById(user_id, id)
      return NextResponse.json({ cycle_id: id, cycle })
    }

    if (action === "duplicate") {
      if (!duplicate_from_id) {
        return NextResponse.json(
          { error: "duplicate_from_id obrigatório" },
          { status: 400 }
        )
      }
      const id = await duplicateCyclePlan(user_id, duplicate_from_id, name)
      const cycle = await getCycleById(user_id, id)
      return NextResponse.json({ cycle_id: id, cycle })
    }

    if (action === "sync_schedule") {
      const cycle_id = body.cycle_id as string
      if (!cycle_id) {
        return NextResponse.json({ error: "cycle_id obrigatório" }, { status: 400 })
      }
      const result = await syncScheduleFromContent(cycle_id, user_id)
      const cycle = await getCycleById(user_id, cycle_id)
      const drift = cycle ? await detectSetupDrift(cycle) : null
      return NextResponse.json({ ...result, cycle, drift })
    }

    if (action === "append_sessions") {
      const cycle_id = body.cycle_id as string
      if (!cycle_id) {
        return NextResponse.json({ error: "cycle_id obrigatório" }, { status: 400 })
      }
      const result = await appendNewSessions(cycle_id, user_id)
      const cycle = await getCycleById(user_id, cycle_id)
      const drift = cycle ? await detectSetupDrift(cycle) : null
      return NextResponse.json({ ...result, cycle, drift })
    }

    if (action === "drift") {
      const cycle_id = body.cycle_id as string
      const cycle = await resolveCycleForUser(user_id, cycle_id)
      if (!cycle) {
        return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 })
      }
      const drift = await detectSetupDrift(cycle)
      return NextResponse.json({ drift })
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { user_id, action, cycle_id, name, description, reset_day_index } = body

  if (!user_id || !cycle_id) {
    return NextResponse.json(
      { error: "user_id e cycle_id obrigatórios" },
      { status: 400 }
    )
  }

  try {
    if (action === "rename") {
      await renameCyclePlan(cycle_id, user_id, name, description)
      const cycle = await getCycleById(user_id, cycle_id)
      return NextResponse.json({ cycle })
    }

    if (action === "activate") {
      const cycle = await activateCycle(user_id, cycle_id, {
        reset_day_index: reset_day_index !== false,
      })
      return NextResponse.json({ cycle, cycle_enabled: true })
    }

    if (action === "pause") {
      await pauseCyclePlan(cycle_id, user_id)
      return NextResponse.json({ ok: true })
    }

    if (action === "archive") {
      await archiveCyclePlan(cycle_id, user_id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
