import { supabaseServer } from "./supabase-server"

export async function fetchQuestionPerformance(questionId: string, userId: string) {
  const { data: question } = await supabaseServer
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .single()

  const { data: options } = await supabaseServer
    .from("question_options")
    .select("*")
    .eq("question_id", questionId)
    .order("sort_order")

  const { data: allAttempts } = await supabaseServer
    .from("question_attempts")
    .select("selected_answer, is_correct, duration_ms, created_at, user_id")
    .eq("question_id", questionId)

  const { data: myAttempts } = await supabaseServer
    .from("question_attempts")
    .select("selected_answer, is_correct, duration_ms, created_at")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  const attempts = allAttempts ?? []
  const total = attempts.length
  const correct = attempts.filter((a) => a.is_correct).length
  const globalCorrectPct = total > 0 ? (correct / total) * 100 : 0

  const altCounts: Record<string, number> = {}
  for (const a of attempts) {
    const key = a.selected_answer
    altCounts[key] = (altCounts[key] ?? 0) + 1
  }

  const alternative_distribution = Object.entries(altCounts).map(([label, count]) => ({
    label,
    count,
    pct: total > 0 ? (count / total) * 100 : 0,
    is_correct: label.toLowerCase() === question?.correct_answer?.toLowerCase(),
  }))

  const durations = attempts
    .map((a) => a.duration_ms)
    .filter((d): d is number => d != null && d > 0)
  const avg_duration_ms =
    durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : null

  const my = myAttempts ?? []
  const myTotal = my.length
  const myCorrect = my.filter((a) => a.is_correct).length

  let difficulty = "Médio"
  if (globalCorrectPct >= 70) difficulty = "Fácil"
  else if (globalCorrectPct < 40) difficulty = "Difícil"

  return {
    question,
    options: options ?? [],
    global: {
      total_resolutions: total,
      correct_pct: globalCorrectPct,
      error_pct: 100 - globalCorrectPct,
      difficulty,
      avg_duration_ms,
      alternative_distribution,
    },
    mine: {
      total_resolutions: myTotal,
      correct_pct: myTotal > 0 ? (myCorrect / myTotal) * 100 : 0,
      error_pct: myTotal > 0 ? ((myTotal - myCorrect) / myTotal) * 100 : 0,
      history: my.map((a) => ({
        date: a.created_at,
        is_correct: a.is_correct,
        selected_answer: a.selected_answer,
        duration_ms: a.duration_ms,
      })),
    },
  }
}
