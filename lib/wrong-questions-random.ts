import { supabaseServer } from "./supabase-server"
import { loadQuestionForStudy } from "./question-study"

export async function listWrongQuestionIds(userId: string): Promise<string[]> {
  const { data: attempts, error } = await supabaseServer
    .from("question_attempts")
    .select("question_id, is_correct, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  const lastByQuestion = new Map<string, boolean>()
  for (const a of attempts ?? []) {
    if (!lastByQuestion.has(a.question_id)) {
      lastByQuestion.set(a.question_id, a.is_correct)
    }
  }

  return [...lastByQuestion.entries()]
    .filter(([, correct]) => !correct)
    .map(([id]) => id)
}

export async function pickRandomWrongQuestionId(
  userId: string,
  excludeId?: string
): Promise<string | null> {
  const ids = await listWrongQuestionIds(userId)
  const pool = excludeId ? ids.filter((id) => id !== excludeId) : ids
  if (!pool.length) return null
  if (pool.length === 1) return pool[0]!
  return pool[Math.floor(Math.random() * pool.length)]!
}

export async function loadRandomWrongQuestion(userId: string, excludeId?: string) {
  const pool = await listWrongQuestionIds(userId)
  const questionId = await pickRandomWrongQuestionId(userId, excludeId)
  if (!questionId) {
    return { question: null, options: [], pool_count: pool.length }
  }

  const loaded = await loadQuestionForStudy(questionId, userId)
  if (!loaded.question) {
    return { question: null, options: [], pool_count: pool.length }
  }

  return {
    question_id: questionId,
    question: loaded.question,
    options: loaded.options,
    pool_count: pool.length,
  }
}
