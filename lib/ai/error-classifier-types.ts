import type { ErrorTaxonomy } from "../coach-types"

export type ClassificationSource = "llm_classify" | "heuristic"

export type WrongAttemptRow = {
  attempt_id: string
  question_id: string
  duration_ms: number | null
  outcome_category: string | null
  confidence_level: string | null
  is_correct?: boolean
  zone?: string
  selected_answer: string
  correct_answer: string
  tec_id: number
  tec_topic: string
  statement: string
  banca: string | null
  ano: number | null
  orgao: string | null
  user_note: string
  notes: string[]
  prior_correct_count: number
  priority_score: number
  options?: { label: string; text: string }[]
  incidence_weight?: number
  edital_weight?: number
  matched_incidence_topic?: string | null
}

export type ClassificationResult = {
  taxonomy: ErrorTaxonomy
  evidence: string[]
  specific_mistake?: string
  confidence?: "alta" | "media" | "baixa"
  source: ClassificationSource
}
