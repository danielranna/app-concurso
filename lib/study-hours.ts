import { supabaseServer } from "./supabase-server"

export { formatStudyDuration } from "./format-study-duration"

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
