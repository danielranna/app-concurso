export type TecSubjectNodeType = "folder" | "topic"

export type TecSubjectNode = {
  id: string
  user_id: string
  tec_subject: string
  parent_id: string | null
  node_type: TecSubjectNodeType
  name: string
  tec_topic: string | null
  sort_order: number
  question_count: number
  percent?: number
  children?: TecSubjectNode[]
}

export type TecSubjectTreeResponse = {
  tec_subject: string
  nodes: TecSubjectNode[]
  ungrouped: TecSubjectNode[]
  total_questions: number
}

export type TecSubjectSummary = {
  tec_subject: string
  topic_count: number
  total_questions: number
  has_tree: boolean
}
