import { supabaseServer } from "./supabase-server"

/** Soma timers de cadernos e sessões combinadas (ms). */
export async function getTotalStudyMs(userId: string): Promise<number> {
  const [notebooks, sessions] = await Promise.all([
    supabaseServer.from("notebooks").select("study_elapsed_ms").eq("user_id", userId),
    supabaseServer.from("study_sessions").select("study_elapsed_ms").eq("user_id", userId),
  ])

  if (notebooks.error) throw new Error(notebooks.error.message)
  if (sessions.error) throw new Error(sessions.error.message)

  let total = 0
  for (const row of notebooks.data ?? []) {
    total += Number(row.study_elapsed_ms ?? 0)
  }
  for (const row of sessions.data ?? []) {
    total += Number(row.study_elapsed_ms ?? 0)
  }
  return total
}

export function formatStudyDuration(ms: number): string {
  if (ms <= 0) return "0 min"
  const totalMin = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hours === 0) return `${mins} min`
  if (mins === 0) return `${hours} h`
  return `${hours} h ${mins} min`
}
