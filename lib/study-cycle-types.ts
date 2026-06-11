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

export type StudyCycleDay = {
  id?: string
  day_index: number
  weekday: number | null
  subject_ids: string[]
  blocks: unknown[]
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
}

export type CyclePlannerInput = {
  subject_ids: string[]
  subjects_per_day: number
  weekday_limits: WeekdayLimits[]
  /** subject_id → brain priority score (optional, for weak-subject 2× suggestion) */
  subject_brain_scores?: Record<string, number>
}

export type CyclePlannerDay = {
  day_index: number
  weekday: number
  subject_ids: string[]
  subject_names: string[]
  estimated_minutes: number
  daily_limits: WeekdayLimits["daily_limits"]
}

export type CyclePlannerResult = {
  total_days: number
  days: CyclePlannerDay[]
  subjects_doubled: string[]
}
