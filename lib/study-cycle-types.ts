export type StudyCycleStatus = "draft" | "active" | "paused" | "completed"

export type WeekdayLimits = {
  weekday: number
  minutes: number
  active: boolean
  daily_limits: {
    questions: number
    flashcards: number
    summaries: number
    error_reviews: number
  }
}

export type StudyCycleBlockType =
  | "questions"
  | "flashcards"
  | "read"
  | "error_review"

export type StudyCycleBlock = {
  id?: string
  cycle_id?: string
  day_index: number
  subject_id: string
  content_node_id: string | null
  block_type: StudyCycleBlockType
  sort_order: number
  label: string
  params: {
    question_count?: number
    minutes?: number
    notebook_id?: string
  }
  subject_name?: string
  content_node_name?: string
}

export type StudyCycleDay = {
  id?: string
  day_index: number
  weekday: number | null
  subject_ids: string[]
  blocks: StudyCycleBlock[]
  plan_date?: string | null
}

export type StudyCycleSubject = {
  subject_id: string
  sort_order: number
  times_in_cycle: number
  subject_name?: string
}

export type StudyCycle = {
  id: string
  user_id: string
  status: StudyCycleStatus
  name: string
  subjects_per_day: number
  started_at: string | null
  paused_at: string | null
  current_day_index: number
  total_days: number
  subjects: StudyCycleSubject[]
  weekday_limits: WeekdayLimits[]
  days: StudyCycleDay[]
  cycle_blocks: StudyCycleBlock[]
}

export type ManualCycleDayInput = {
  day_index: number
  weekday: number | null
  blocks: Omit<StudyCycleBlock, "id" | "cycle_id">[]
}

export type ManualCycleSaveInput = {
  name?: string
  weekday_limits?: WeekdayLimits[]
  days: ManualCycleDayInput[]
}
