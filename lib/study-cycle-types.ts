export type StudyCycleStatus = "draft" | "active" | "paused" | "completed"

/** Exibido como "Arquivado" na UI quando status === completed */
export function cycleStatusLabel(status: StudyCycleStatus): string {
  switch (status) {
    case "active":
      return "Ativo"
    case "paused":
      return "Pausado"
    case "completed":
      return "Arquivado"
    case "draft":
    default:
      return "Rascunho"
  }
}

export type WeekdayLimits = {
  weekday: number
  minutes: number
  active: boolean
  /** Teto de blocos de estudo por dia; null = usar padrão do planner. */
  max_blocks?: number | null
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
  content_block_id?: string | null
  block_type: StudyCycleBlockType
  sort_order: number
  label: string
  params: {
    question_count?: number
    minutes?: number
    notebook_id?: string
    mini_cycle_index?: number
    block_pass?: number
    study_note?: string
  }
  subject_name?: string
  content_node_name?: string
  content_block_name?: string
  queue_position?: number | null
  status?: "pending" | "completed"
  completed_at?: string | null
}

export type StudyCycleContentBlockTopic = {
  id?: string
  content_block_id?: string
  tec_subject: string
  tec_topic: string
  sort_order: number
}

export type StudyCycleContentBlock = {
  id: string
  cycle_id: string
  subject_id: string
  name: string
  sort_order: number
  estimated_minutes: number
  study_note?: string | null
  notebook_id?: string | null
  notebook_name?: string | null
  phase_label?: string | null
  topics: StudyCycleContentBlockTopic[]
  subject_name?: string
}

export type PlanningMode = "time_driven" | "deadline_driven"

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
  weight?: number
  subject_name?: string
}

export type StudyCycle = {
  id: string
  user_id: string
  status: StudyCycleStatus
  name: string
  subjects_per_day: number
  description?: string | null
  planning_mode?: PlanningMode
  target_weeks?: number | null
  default_block_minutes?: number
  started_at: string | null
  paused_at: string | null
  current_day_index: number
  total_days: number
  subjects: StudyCycleSubject[]
  weekday_limits: WeekdayLimits[]
  days: StudyCycleDay[]
  cycle_blocks: StudyCycleBlock[]
  content_blocks?: StudyCycleContentBlock[]
}

export type ManualCycleDayInput = {
  day_index: number
  weekday: number | null
  blocks: Omit<StudyCycleBlock, "id" | "cycle_id">[]
}

export type ManualCycleSaveInput = {
  cycle_id?: string
  name?: string
  reset_day_index?: boolean
  weekday_limits?: WeekdayLimits[]
  planning_mode?: PlanningMode
  target_weeks?: number
  default_block_minutes?: number
  subjects_per_day?: number
  subjects?: { subject_id: string; sort_order: number; weight: number }[]
  days: ManualCycleDayInput[]
}
