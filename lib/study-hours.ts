import { supabaseServer } from "./supabase-server"
import { fetchAllPages } from "./supabase-pages"

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

/** Soma duration_ms das questões respondidas desde `since`. Sem data, soma todas. */
export async function getQuestionStudyMs(userId: string, since: string | null): Promise<number> {
  const rows = await fetchAllPages<{ duration_ms: number | null }>((from, to) => {
    let query = supabaseServer
      .from("question_attempts")
      .select("id, duration_ms")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
    if (since) query = query.gte("created_at", since)
    return query
  })

  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.duration_ms ?? 0)), 0)
}
