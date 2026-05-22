export type LearningSignalType =
  | "high_recurrence"
  | "consolidated"
  | "false_positive_pattern"
  | "slow_struggle"
  | "fast_guess_wrong"
  | "time_improving"

export type LearningSignal = {
  signal_type: LearningSignalType
  entity_type: "question" | "tec_topic"
  entity_id: string
  score: number
  metadata: Record<string, unknown>
}

export type ExecutableActionType =
  | "create_remediation_notebook"
  | "start_combined_study"
  | "review_errors"
  | "review_flashcards"
  | "open_bank_filter"
  | "read_material"
  | "flashcard_create"
  | "error_create"
  | "notebook_create"
  | "question_pick"

export type ExecutableAction = {
  type: ExecutableActionType
  label: string
  params: Record<string, unknown>
  priority?: number
  estimated_minutes?: number
}

export type AiActionDraftType =
  | "flashcard_create"
  | "error_create"
  | "notebook_create"
  | "question_pick"

export type AiActionDraft = {
  id: string
  user_id: string
  subject_id: string | null
  exam_target_id: string | null
  type: AiActionDraftType
  label: string
  payload: Record<string, unknown>
  status: "pending" | "approved" | "rejected"
  source_agent: string | null
  created_at: string
  resolved_at: string | null
}

export type NotebookReportStructured = {
  headline: string
  strengths: { topic: string; evidence: string }[]
  weaknesses: { topic: string; evidence: string; severity: string }[]
  time_insights: { topic: string; pattern: string; evidence: string }[]
  metacognition_patterns: { pattern: string; count: number; advice: string }[]
  recurring_failures: { tec_id: number; attempts: number; advice: string }[]
  consolidated_topics: string[]
  actions_next_7_days: { action: string; priority: number; minutes_estimate: number }[]
  executable_actions: ExecutableAction[]
  confidence_in_analysis: string
}

export type ExamPlanStructured = {
  headline?: string
  subject_priority_rank?: {
    subject_name: string
    priority: number
    why?: string
  }[]
  topic_matrix?: {
    subject?: string
    topic?: string
    edital_weight_hint?: string
    incidence_hint?: string
    your_gap?: string
    action?: string
  }[]
  weekly_plan?: {
    day: string
    focus: string
    minutes: number
    resource: string
  }[]
  executable_actions?: ExecutableAction[]
  risks_if_ignored?: string[]
  exam_readiness_score?: number
  raw?: string
}

export type ExamTarget = {
  id: string
  user_id: string
  name: string
  banca: string | null
  orgao: string | null
  cargo: string | null
  year: number | null
  edital_document_id: string | null
  is_active: boolean
  created_at: string
}
