import type { ExamPlanStructured } from "./coach-types"

export type StrategicMdMetadata = Record<string, string>

export type StrategicEditalSubject = {
  slug: string
  name: string
  prova: "P1" | "P2"
  itens: number
}

export type StrategicSubjectRanking = {
  ranking: number
  slug: string
  name: string
  prova?: string
  itens?: number
  peso_relativo?: number
  observacao?: string
  justificativa?: string
}

export type StrategicIncidenceSubject = {
  ranking_incidencia?: number
  slug: string
  name: string
  categoria_excel?: string
  total_historico?: number
  incidencia_relativa_pct?: number
  classificacao?: string
}

export type StrategicTopicRow = {
  topic: string
  quantity: number
  percent: number
  is_subarea?: boolean
}

export type StrategicPriorityGroup = {
  prioridade: number
  slug: string
  name: string
  justificativa?: string
  motivo?: string
  recomendacao?: string
}

export type StrategicStudyStep = {
  fase: string
  etapa: string
  slug: string
  name: string
  descricao?: string
}

export type StrategicAlert = {
  alerta: string
  descricao: string
}

export type StrategicMdBundle = {
  metadata: StrategicMdMetadata
  edital_subjects: StrategicEditalSubject[]
  subject_ranking: StrategicSubjectRanking[]
  incidence_subjects: StrategicIncidenceSubject[]
  topics_by_slug: Record<string, StrategicTopicRow[]>
  priorities: {
    prioritarias: StrategicPriorityGroup[]
    secundarias: StrategicPriorityGroup[]
    armadilha: StrategicPriorityGroup[]
  }
  study_order: StrategicStudyStep[]
  study_hours: { ordem: number; slug: string; name: string; horas_minimas?: number }[]
  alerts: StrategicAlert[]
  parse_warnings: string[]
}

export type SlugSubjectMapping = {
  slug: string
  md_name: string
  subject_id: string | null
  subject_name: string | null
  match_score: number
  topic_count: number
  manual?: boolean
}

export type StrategicMdMappings = {
  by_slug: SlugSubjectMapping[]
  manual_overrides: Record<string, string | null>
  merge_warnings: { subject_id: string; subject_name: string; slugs: string[] }[]
}

export type StrategicEnrichment = {
  edital_hierarchy?: {
    subject: string
    children: { topic: string; children: { topic: string }[] }[]
  }[]
  nuclear_topics?: { subject: string; topic: string; why: string }[]
  predictability_index?: {
    subject: string
    slug: string
    score: number
    label: "estavel" | "moderado" | "imprevisivel"
    why: string
  }[]
  topic_matrix_enriched?: ExamPlanStructured["topic_matrix"]
  enriched_at?: string
  model_used?: string
}

export type StrategicAnalysisPayload = {
  exam_target_id: string
  document_id: string | null
  bundle: StrategicMdBundle | null
  mappings: StrategicMdMappings | null
  priorities: ExamPlanStructured | null
  enrichment: StrategicEnrichment | null
  incidence_row_count: number
  parse_stats: Record<string, unknown> | null
  strategic_queue_preview?: {
    subject_id: string
    topic_key: string
    priority_score: number
    gap_score: number
    reason: string | null
  }[]
  topic_ranking?: {
    subject: string
    topic: string
    quantity: number
    percent: number
  }[]
}
