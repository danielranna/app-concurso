export type QuestionType = "multiple_choice" | "certo_errado"

export type QuestionRow = {
  id: string
  tec_id: number
  tec_url: string
  type: QuestionType
  banca: string | null
  cargo: string | null
  orgao: string | null
  ano: number | null
  tec_subject: string | null
  tec_topic: string | null
  statement: string
  correct_answer: string
  imported_at: string
}

export type QuestionOptionRow = {
  id: string
  question_id: string
  label: string
  text: string
  sort_order: number
}

export type ParsedTecQuestion = {
  index: number
  tec_id: number
  tec_url: string
  type: QuestionType
  banca: string
  cargo: string
  orgao: string
  ano: number | null
  tec_subject: string
  tec_topic: string
  statement: string
  options: { label: string; text: string }[]
  correct_answer: string
}

export type ParsedTecNotebook = {
  name: string
  share_url: string | null
  ordering: string | null
  questions: ParsedTecQuestion[]
  warnings: string[]
}

export type NotebookRow = {
  id: string
  user_id: string
  subject_id: string | null
  folder_id: string | null
  name: string
  share_url: string | null
  question_count: number
  answered_count: number
  last_accessed_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type NotebookFolderRow = {
  id: string
  user_id: string
  subject_id: string | null
  parent_id: string | null
  name: string
  created_at: string
  updated_at: string
}

export type StudyQueueItem = {
  question_id: string
  tec_id: number
  notebook_id: string
  position: number
}

export type BankFilters = {
  banca?: string[]
  orgao?: string[]
  cargo?: string[]
  ano?: number[]
  tec_subject?: string[]
  tec_topic?: string[]
  type?: QuestionType[]
  subject_id?: string
  topic_id?: string
  search?: string
}

export type TecMappingRow = {
  id: string
  user_id: string
  tec_subject: string
  tec_topic: string | null
  subject_id: string
  topic_id: string | null
}
