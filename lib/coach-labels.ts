import type { ErrorTaxonomy } from "./coach-types"

export const ERROR_TAXONOMY_LABELS: Record<ErrorTaxonomy, string> = {
  desatencao: "Desatenção",
  pegadinha_interpretacao: "Pegadinha / interpretação",
  falta_compreensao: "Falta de compreensão",
  calculo_procedimento: "Cálculo / procedimento",
  falta_memorizacao: "Falta de memorização",
  nao_aplicavel: "Não aplicável",
}

export const BRAIN_STATUS_LABELS: Record<string, string> = {
  dominado: "Dominado",
  forte: "Forte",
  instavel: "Instável",
  fraco: "Fraco",
  critico: "Crítico",
  ilusao_dominio: "Ilusão de domínio",
  em_evolucao: "Em evolução",
}
