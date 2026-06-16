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
}
