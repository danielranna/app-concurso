import { NextResponse } from "next/server"
import {
  completeQueueItemDb,
  loadCycleWithQueue,
  skipQueueItemDb,
} from "@/lib/study-cycle-queue-db"
import {
  buildPaceAnalytics,
  getQueueState,
} from "@/lib/study-cycle-queue"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const cycle = await loadCycleWithQueue(user_id)
  if (!cycle?.cycle_blocks?.length) {
    return NextResponse.json({
      cycle,
      queue: null,
      pace: null,
    })
  }

  const queue = getQueueState(cycle)
  const pace = buildPaceAnalytics(cycle)

  return NextResponse.json({ cycle, queue, pace })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, action, block_id } = body

  if (!user_id || !action || !block_id) {
    return NextResponse.json(
      { error: "user_id, action e block_id obrigatórios" },
      { status: 400 }
    )
  }

  const cycle = await loadCycleWithQueue(user_id)
  if (!cycle) {
    return NextResponse.json({ error: "Ciclo não encontrado" }, { status: 404 })
  }

  try {
    if (action === "complete") {
      await completeQueueItemDb(cycle.id, block_id)
    } else if (action === "skip") {
      await skipQueueItemDb(cycle.id, block_id)
    } else {
      return NextResponse.json({ error: "action inválida" }, { status: 400 })
    }

    const updated = await loadCycleWithQueue(user_id)
    if (!updated) {
      return NextResponse.json({ error: "Ciclo não encontrado" }, { status: 404 })
    }

    return NextResponse.json({
      cycle: updated,
      queue: getQueueState(updated),
      pace: buildPaceAnalytics(updated),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
