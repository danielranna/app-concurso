import { supabaseServer } from "../supabase-server"
import type { QuestionOption } from "./question-option-utils"

export type { QuestionOption } from "./question-option-utils"
export { resolveOptionText } from "./question-option-utils"

export async function loadOptionsByQuestion(
  questionIds: string[]
): Promise<Map<string, QuestionOption[]>> {
  const map = new Map<string, QuestionOption[]>()
  if (!questionIds.length) return map

  const { data } = await supabaseServer
    .from("question_options")
    .select("question_id, label, text, sort_order")
    .in("question_id", questionIds)
    .order("sort_order", { ascending: true })

  for (const o of data ?? []) {
    const list = map.get(o.question_id) ?? []
    list.push({
      label: String(o.label),
      text: String(o.text ?? "").slice(0, 200),
    })
    map.set(o.question_id, list)
  }
  return map
}
