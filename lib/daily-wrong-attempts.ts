import { supabaseServer } from "./supabase-server"
import type { DailyWrongItem } from "./daily-wrong-attempts-types"
import {
  dayBounds,
  dedupeDailyWrongAttempts,
  todayDateString,
} from "./daily-wrong-attempts-utils"

export type { DailyWrongItem } from "./daily-wrong-attempts-types"
export { dayBounds, dedupeDailyWrongAttempts, todayDateString } from "./daily-wrong-attempts-utils"

type QuestionJoin = {
  id: string
  tec_id: number
  tec_url: string
  correct_answer: string
  tec_subject: string | null
  tec_topic: string | null
}

type AttemptRow = {
  id: string
  question_id: string
  selected_answer: string
  created_at: string
  notebook_id: string | null
  questions: QuestionJoin | QuestionJoin[] | null
}

function unwrapQ(
  q: QuestionJoin | QuestionJoin[] | null | undefined
): QuestionJoin | null {
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : q
}

function mapAttemptRow(a: AttemptRow): DailyWrongItem | null {
  const q = unwrapQ(a.questions)
  if (!q?.tec_id || !q.tec_url) return null
  return {
    attempt_id: a.id,
    question_id: a.question_id,
    tec_id: q.tec_id,
    tec_url: q.tec_url,
    selected_answer: a.selected_answer,
    correct_answer: q.correct_answer,
    tec_subject: q.tec_subject,
    tec_topic: q.tec_topic,
    created_at: a.created_at,
    notebook_id: a.notebook_id,
  }
}

export async function listDailyWrongAttempts(
  userId: string,
  dateStr?: string
): Promise<{ date: string; count: number; items: DailyWrongItem[] }> {
  const date = dateStr ?? todayDateString()
  const { start, end } = dayBounds(date)

  const { data, error } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      id, question_id, selected_answer, created_at, notebook_id,
      questions ( id, tec_id, tec_url, correct_answer, tec_subject, tec_topic )
    `
    )
    .eq("user_id", userId)
    .eq("is_correct", false)
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  const mapped = (data ?? [])
    .map((row) => mapAttemptRow(row as AttemptRow))
    .filter((row): row is DailyWrongItem => row != null)

  const items = dedupeDailyWrongAttempts(mapped)

  return { date, count: items.length, items }
}
