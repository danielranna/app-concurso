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
    .select(
      "selected_answer, is_correct, duration_ms, created_at, confidence_level, outcome_category"
    )
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

  const OUTCOME_LABELS: Record<string, string> = {
    conhecimento_solido: "Conhecimento sólido",
    conhecimento_fragil: "Conhecimento frágil",
    lacuna_critica: "Lacuna crítica",
    lacuna_consciente: "Lacuna consciente",
    falso_positivo: "Falso positivo",
    conteudo_desconhecido: "Conteúdo desconhecido",
  }

  const outcomeCounts: Record<string, number> = {}
  for (const a of my) {
    const key = (a as { outcome_category?: string }).outcome_category ?? "outro"
    outcomeCounts[key] = (outcomeCounts[key] ?? 0) + 1
  }
  const outcome_breakdown = Object.entries(outcomeCounts).map(([key, count]) => ({
    key,
    label: OUTCOME_LABELS[key] ?? key,
    count,
    pct: myTotal > 0 ? (count / myTotal) * 100 : 0,
  }))

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
        confidence_level: (a as { confidence_level?: string }).confidence_level,
        outcome_category: (a as { outcome_category?: string }).outcome_category,
        outcome_label:
          OUTCOME_LABELS[(a as { outcome_category?: string }).outcome_category ?? ""] ??
          (a as { outcome_category?: string }).outcome_category,
      })),
      outcome_breakdown,
    },
  }
}
