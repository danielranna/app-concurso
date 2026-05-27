import type { ErrorTaxonomy, LearningSignalType } from "./coach-types"
import type { OutcomeCategory } from "./question-types"

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

export const TREND_LABELS: Record<string, string> = {
  melhorando: "Melhorando",
  piorando: "Piorando",
  estagnado: "Estagnado",
  desconhecido: "Desconhecido",
}

export const OUTCOME_CATEGORY_LABELS: Record<OutcomeCategory | string, string> = {
  conhecimento_solido: "Conhecimento sólido",
  conhecimento_fragil: "Conhecimento frágil",
  lacuna_critica: "Lacuna crítica",
  lacuna_consciente: "Lacuna consciente",
  falso_positivo: "Falso positivo",
  conteudo_desconhecido: "Conteúdo desconhecido",
  unknown: "Sem classificação",
}

export const SIGNAL_LABELS: Record<LearningSignalType, string> = {
  high_recurrence: "Alta reincidência",
  consolidated: "Consolidado",
  false_positive_pattern: "Falso positivo recorrente",
  slow_struggle: "Lentidão + insegurança",
  fast_guess_wrong: "Chute rápido errado",
  time_improving: "Tempo melhorando",
}

export const SIGNAL_DESCRIPTIONS: Record<LearningSignalType, string> = {
  high_recurrence:
    "Você errou a mesma questão várias vezes — o sistema trata como ponto de atenção recorrente.",
  consolidated:
    "Várias respostas seguras e corretas na mesma questão — conhecimento está se consolidando.",
  false_positive_pattern:
    "Acertos com chute ou falso positivo no mesmo assunto — risco de ilusão de domínio.",
  slow_struggle:
    "Erros demorados com insegurança — indica dificuldade real no conteúdo.",
  fast_guess_wrong:
    "Erro rápido com chute ou lacuna — pode ser desatenção ou conteúdo não dominado.",
  time_improving:
    "Você melhorou o tempo entre a primeira falha e um acerto posterior na mesma questão.",
}
