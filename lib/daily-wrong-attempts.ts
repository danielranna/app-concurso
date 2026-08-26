import "server-only"

import { supabaseServer } from "./supabase-server"
import type { DailyWrongItem, DailyWrongOption } from "./daily-wrong-attempts-types"
import {
  dayBounds,
  dedupeDailyWrongAttempts,
  todayDateString,
} from "./daily-wrong-attempts-utils"

export type { DailyWrongItem, DailyWrongOption } from "./daily-wrong-attempts-types"
export {
  dayBounds,
  dedupeDailyWrongAttempts,
  splitDailyWrongOptions,
  todayDateString,
} from "./daily-wrong-attempts-utils"

type QuestionJoin = {
  id: string
  tec_id: number
  tec_url: string
  correct_answer: string
  tec_subject: string | null
  tec_topic: string | null
  type: string | null
  statement: string | null
}

type UserQuestionEditRow = {
  question_id: string
  type: string | null
  statement: string | null
  content_before: string | null
  content_after: string | null
  content_blocks: unknown | null
  correct_answer: string | null
  options: unknown
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
    type: q.type,
    statement: q.statement ?? "",
    content_before: null,
    content_after: null,
    content_blocks: null,
    options: [],
  }
}

async function loadOptionsByQuestionIds(
  questionIds: string[]
): Promise<Map<string, DailyWrongOption[]>> {
  const map = new Map<string, DailyWrongOption[]>()
  if (!questionIds.length) return map

  const { data } = await supabaseServer
    .from("question_options")
    .select("question_id, label, text, sort_order")
    .in("question_id", questionIds)
    .order("sort_order", { ascending: true })

  for (const row of data ?? []) {
    const list = map.get(row.question_id) ?? []
    list.push({
      label: String(row.label),
      text: String(row.text ?? ""),
    })
    map.set(row.question_id, list)
  }
  return map
}

async function loadUserEditsByQuestionIds(
  userId: string,
  questionIds: string[]
): Promise<Map<string, UserQuestionEditRow>> {
  const map = new Map<string, UserQuestionEditRow>()
  if (!questionIds.length) return map

  const { data, error } = await supabaseServer
    .from("user_question_edits")
    .select(
      "question_id, type, statement, content_before, content_after, content_blocks, correct_answer, options"
    )
    .eq("user_id", userId)
    .in("question_id", questionIds)

  if (error) return map

  for (const row of data ?? []) {
    map.set(row.question_id, row as UserQuestionEditRow)
  }
  return map
}

function optionsFromEdit(edit?: UserQuestionEditRow): DailyWrongOption[] | null {
  if (!edit || !Array.isArray(edit.options)) return null
  const options = edit.options as { label?: unknown; text?: unknown }[]
  if (!options.length) return null
  return options.map((o) => ({
    label: String(o.label ?? ""),
    text: String(o.text ?? ""),
  }))
}

function applyUserEdit(item: DailyWrongItem, edit?: UserQuestionEditRow) {
  if (!edit) return
  if (edit.type) item.type = edit.type
  if (edit.statement != null) item.statement = edit.statement
  if (edit.correct_answer != null) item.correct_answer = edit.correct_answer
  item.content_before = edit.content_before
  item.content_after = edit.content_after
  item.content_blocks = edit.content_blocks
}

export async function listDailyWrongAttempts(
  userId: string,
  dateStr?: string,
  opts?: { includeContent?: boolean }
): Promise<{ date: string; count: number; items: DailyWrongItem[] }> {
  const date = dateStr ?? todayDateString()
  const includeContent = opts?.includeContent !== false
  const { start, end } = dayBounds(date)

  const questionFields = includeContent
    ? "id, tec_id, tec_url, correct_answer, tec_subject, tec_topic, type, statement"
    : "id, tec_id, tec_url, correct_answer, tec_subject, tec_topic"

  const { data, error } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      id, question_id, selected_answer, created_at, notebook_id,
      questions ( ${questionFields} )
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

  if (includeContent && items.length) {
    const questionIds = items.map((item) => item.question_id)
    const [optionsByQuestion, editsByQuestion] = await Promise.all([
      loadOptionsByQuestionIds(questionIds),
      loadUserEditsByQuestionIds(userId, questionIds),
    ])
    for (const item of items) {
      const edit = editsByQuestion.get(item.question_id)
      applyUserEdit(item, edit)
      const raw = optionsFromEdit(edit) ?? optionsByQuestion.get(item.question_id) ?? []
      item.options =
        item.type === "certo_errado" && raw.length === 0
          ? [
              { label: "Certo", text: "Certo" },
              { label: "Errado", text: "Errado" },
            ]
          : raw
    }
  }

  return { date, count: items.length, items }
}
