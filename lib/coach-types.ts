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

export type ErrorTaxonomy =
  | "desatencao"
  | "pegadinha_interpretacao"
  | "falta_compreensao"
  | "calculo_procedimento"
  | "falta_memorizacao"
  | "nao_aplicavel"

export type TeacherCitation = {
  document_title: string
  excerpt: string
  page?: number | null
}

export type AuditZone = "red" | "yellow" | "green"

export type PerQuestionError = {
  question_id: string
  attempt_id?: string
  tec_id?: number
  tec_topic?: string
  error_taxonomy: ErrorTaxonomy
  priority_score?: number
  specific_mistake?: string
  misconception?: string
  explanation?: string
  explanation_source?: "material" | "ai_generated"
  explanation_citations?: TeacherCitation[]
  topic_explanation_key?: string
  topic_group_size?: number
  brain_topic_status?: string
  evidence?: string[]
  question_index?: number
  header_label?: string
  statement_excerpt?: string
  marked_answer?: string
  correct_answer?: string
  user_note?: string
  zone?: AuditZone
  outcome_category?: string
  confidence_level?: string
  feedback_detailed?: string
}

export type BehavioralAuditQuestionItem = {
  question_index: number
  question_id: string
  header_label: string
  statement_excerpt: string
  marked: string
  answer_key: string
  user_note?: string
  outcome_category?: string
  confidence_level?: string
  feedback: string
  misconception?: string
  error_taxonomy?: ErrorTaxonomy
}

export type BehavioralAudit = {
  performance_summary: {
    correct: number
    total: number
    pct: number
    avg_duration_ms?: number
    groups: { red: number; yellow: number; green: number }
  }
  red_zone: BehavioralAuditQuestionItem[]
  yellow_zone: BehavioralAuditQuestionItem[]
  green_zone: {
    mastered_indexes: number[]
    theory_balance: string
  }
  model_used?: string
  generated_at?: string
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
  per_question_errors?: PerQuestionError[]
  behavioral_audit?: BehavioralAudit
  confidence_in_analysis: string
}

export type TopicBrainEntry = {
  status:
    | "dominado"
    | "forte"
    | "instavel"
    | "fraco"
    | "critico"
    | "ilusao_dominio"
    | "em_evolucao"
  dominio: number
  estabilidade: number
  retencao: number
  predominant_error?: ErrorTaxonomy
  /** Último equívoco específico detectado no relatório */
  last_insight?: string
  /** Nome exibível do tópico (tec_topic original) */
  label?: string
}

export type SubjectBrainState = {
  topic_map: Record<string, TopicBrainEntry>
  error_profile_by_topic: Record<string, ErrorTaxonomy>
  danger_topics: string[]
  trend: "melhorando" | "piorando" | "estagnado" | "desconhecido"
  last_report_id?: string
  dominio_delta?: Record<string, number>
  report_merged?: boolean
  computed_at?: string
}

export type StrategicQueueItem = {
  id: string
  subject_id: string
  topic_key: string
  topic_label?: string
  priority_score: number
  incidence_weight: number
  gap_score: number
  retention_penalty: number
  subject_priority?: number
  reason: string | null
  source: "sql" | "llm"
  computed_at: string
}

export type DailyStudyBlock = {
  subject_id: string
  subject_name?: string
  type:
    | "questions"
    | "flashcards"
    | "error_review"
    | "read_material"
    | "notebook_create"
  count: number
  minutes: number
  label: string
  params: Record<string, unknown>
}

export type DailyStudyPlan = {
  id?: string
  date: string
  mode: "pre_edital" | "pos_edital" | "reta_final"
  limits: {
    questions: number
    flashcards: number
    summaries: number
    error_reviews?: number
  }
  blocks: DailyStudyBlock[]
  rotation_note?: string
  narrative_summary?: string
  combined_notebook_id?: string | null
  combined_question_count?: number
  user_pinned?: boolean
  completed_block_keys?: string[]
}

export type EditalSubjectRankRow = {
  subject_name: string
  priority: number
  why?: string
  edital_weight?: string
  incidence_summary?: string
  question_count?: number
  percent_of_total?: number
  prova?: string
  tiebreaker_note?: string
  impact_on_final_score?: string
  /** Como a % foi calculada (ex.: 25÷133×100). */
  percent_calculation?: string
}

export type EditalSubjectLabel = {
  name: string
  why?: string
}

export type DiscursiveSubjectNote = {
  name: string
  question_count?: number
  percent_of_total?: number
  prova?: string
  note?: string
}

export type EditalIncidenceMapNote = {
  edital_subject?: string
  excel_subject?: string
  top_topics?: string[]
  note?: string
}

export type ExamPlanStructured = {
  headline?: string
  edital_summary?: string
  strategic_conclusions?: string[]
  priority_subjects?: EditalSubjectLabel[]
  secondary_subjects?: EditalSubjectLabel[]
  trap_subjects?: EditalSubjectLabel[]
  discursive_subjects?: DiscursiveSubjectNote[]
  discursive_note?: string
  /** Regra global do % (só matérias objetivas no denominador). */
  objective_percent_formula?: string
  incidence_map_notes?: EditalIncidenceMapNote[]
  subject_priority_rank?: EditalSubjectRankRow[]
  topic_matrix?: {
    subject?: string
    topic?: string
    edital_weight_hint?: string
    incidence_hint?: string
    incidence_percent?: number
    incidence_quantity?: number
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
