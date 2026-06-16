import { supabaseServer } from "./supabase-server"
import { getActiveOrDraftCycle } from "./study-cycle-db"
import type { StudyCycle } from "./study-cycle-types"

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
    .select("id, queue_position, status, day_index, sort_order")
    .eq("cycle_id", cycleId)

  if (loadError) throw new Error(loadError.message)
  if (!rows?.length) throw new Error("Nenhum bloco na fila")

  const pending = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => {
      const pa = a.queue_position ?? a.day_index * 1000 + a.sort_order
      const pb = b.queue_position ?? b.day_index * 1000 + b.sort_order
      return pa - pb
    })

  const idx = pending.findIndex((r) => r.id === blockId)
  if (idx < 0) throw new Error("Bloco não encontrado na fila")
  if (idx >= pending.length - 1) {
    throw new Error("Não há próximo bloco para trocar")
  }

  const current = pending[idx]
  const next = pending[idx + 1]
  const posCurrent = current.queue_position ?? idx
  const posNext = next.queue_position ?? idx + 1

  const { error: e1 } = await supabaseServer
    .from("study_cycle_blocks")
    .update({ queue_position: posNext })
    .eq("id", current.id)

  if (e1) throw new Error(e1.message)

  const { error: e2 } = await supabaseServer
    .from("study_cycle_blocks")
    .update({ queue_position: posCurrent })
    .eq("id", next.id)

  if (e2) throw new Error(e2.message)
}

export async function loadCycleWithQueue(userId: string): Promise<StudyCycle | null> {
  return getActiveOrDraftCycle(userId)
}
