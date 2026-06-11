export type ContentNodeType = "group" | "topic"

export type ContentNodeBancaIncidence = {
  id?: string
  banca: string
  percent: number
  notes?: string | null
}

export type SubjectContentNode = {
  id: string
  user_id: string
  subject_id: string
  parent_id: string | null
  node_type: ContentNodeType
  name: string
  tec_subject: string | null
  tec_topic: string | null
  notebook_id: string | null
  sort_order: number
  question_count: number
  synced_at: string | null
  incidence?: ContentNodeBancaIncidence[]
  children?: SubjectContentNode[]
}

export type ContentTreeResponse = {
  subject_id: string
  nodes: SubjectContentNode[]
  ungrouped: SubjectContentNode[]
}
