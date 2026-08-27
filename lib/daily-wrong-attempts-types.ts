export type DailyWrongOption = {
  label: string
  text: string
}

export type DailyWrongNote = {
  body: string
  ai_feedback: string | null
}

export type DailyWrongItem = {
  attempt_id: string
  question_id: string
  tec_id: number
  tec_url: string
  selected_answer: string
  correct_answer: string
  tec_subject: string | null
  tec_topic: string | null
  created_at: string
  notebook_id: string | null
  type: string | null
  statement: string
  content_before: string | null
  content_after: string | null
  content_blocks: unknown | null
  options: DailyWrongOption[]
  feedback_detailed?: string | null
  misconception?: string | null
  notes?: DailyWrongNote[]
}
