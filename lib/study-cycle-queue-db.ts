import { supabaseServer } from "./supabase-server"
import type { StudyCycle } from "./study-cycle-types"

/** Corrige queue_position para bater com a ordem do calendário. */
export async function realignQueuePositionsDb(cycleId: string): Promise<boolean> {
  const { data: rows, error } = await supabaseServer
    .from("study_cycle_blocks")
    .select("id, day_index, sort_order, queue_position")
    .eq("cycle_id", cycleId)

  if (error || !rows?.length) return false

  const sorted = [...rows].sort(
    (a, b) => a.day_index - b.day_index || a.sort_order - b.sort_order
  )
  let changed = false
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].queue_position !== i) {
      changed = true
      const { error: upErr } = await supabaseServer
        .from("study_cycle_blocks")
        .update({ queue_position: i })
        .eq("id", sorted[i].id)
      if (upErr) throw new Error(upErr.message)
    }
  }
  return changed
}

export async function completeQueueItemDb(
  cycleId: string,
  blockId: string
): Promise<void> {
  const { error } = await supabaseServer
    .from("study_cycle_blocks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", blockId)
    .eq("cycle_id", cycleId)
    .eq("status", "pending")

  if (error) throw new Error(error.message)
}

export async function skipQueueItemDb(
  cycleId: string,
  blockId: string
): Promise<void> {
  const { data: rows, error: loadError } = await supabaseServer
    .from("study_cycle_blocks")
    .select("id, status, day_index, sort_order")
    .eq("cycle_id", cycleId)

  if (loadError) throw new Error(loadError.message)
  if (!rows?.length) throw new Error("Nenhum bloco na fila")

  const pending = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => a.day_index - b.day_index || a.sort_order - b.sort_order)

  const idx = pending.findIndex((r) => r.id === blockId)
  if (idx < 0) throw new Error("Bloco não encontrado na fila")
  if (idx >= pending.length - 1) {
    throw new Error("Não há próximo bloco para trocar")
  }

  const current = pending[idx]
  const next = pending[idx + 1]

  const { error: e1 } = await supabaseServer
    .from("study_cycle_blocks")
    .update({
      day_index: next.day_index,
      sort_order: next.sort_order,
    })
    .eq("id", current.id)

  if (e1) throw new Error(e1.message)

  const { error: e2 } = await supabaseServer
    .from("study_cycle_blocks")
    .update({
      day_index: current.day_index,
      sort_order: current.sort_order,
    })
    .eq("id", next.id)

  if (e2) throw new Error(e2.message)

  await realignQueuePositionsDb(cycleId)
}

export async function reopenQueueItemDb(
  cycleId: string,
  blockId: string
): Promise<void> {
  const { error } = await supabaseServer
    .from("study_cycle_blocks")
    .update({
      status: "pending",
      completed_at: null,
    })
    .eq("id", blockId)
    .eq("cycle_id", cycleId)
    .eq("status", "completed")

  if (error) throw new Error(error.message)
}

export async function loadCycleWithQueue(
  userId: string,
  cycleId?: string | null
): Promise<StudyCycle | null> {
  const { getActiveCycle, resolveCycleForUser } = await import("./study-cycle-db")
  if (cycleId) return resolveCycleForUser(userId, cycleId)
  const active = await getActiveCycle(userId)
  if (active) return active
  return resolveCycleForUser(userId, null)
}
