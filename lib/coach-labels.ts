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
  sem_dados: "Sem dados",
}

/** Critérios alinhados a `statusFromMetrics` em lib/ai/subject-brain.ts */
export const BRAIN_STATUS_DESCRIPTIONS: Record<string, string> = {
  dominado:
    "Domínio ≥ 85% de acertos no assunto e estabilidade ≥ 70% (pouca oscilação entre tentativas).",
  forte:
    "Domínio ≥ 70% e estabilidade ≥ 50% — você acerta com consistência razoável.",
  instavel:
    "Domínio entre 55% e 70%, mas estabilidade baixa (< 45%) — acerta e erra de forma alternada.",
  fraco:
    "Domínio abaixo de 55% no assunto — ainda há lacuna clara no conteúdo.",
  critico:
    "Domínio abaixo de 45% e pelo menos 3 erros registrados no assunto — prioridade alta.",
  ilusao_dominio:
    "Domínio aparentemente ok (≥ 60%), mas estabilidade muito baixa (< 35%) ou padrão de chute/falso positivo — cuidado para não superestimar.",
  em_evolucao:
    "Situação intermediária que não se encaixa nas regras acima; ainda em construção.",
  sem_dados: "Nenhuma tentativa mapeada neste assunto ainda.",
}

export const OUTCOME_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  conhecimento_solido:
    "Você marcou seguro e acertou — o sistema interpreta como domínio real naquela tentativa.",
  conhecimento_fragil:
    "Você marcou inseguro mas acertou — acerto frágil, pode não sustentar na prova.",
  lacuna_critica:
    "Seguro e errou — lacuna que você ainda não percebia.",
  lacuna_consciente:
    "Inseguro e errou — você já sentia a dificuldade.",
  falso_positivo:
    "Chutou e acertou — não conta como domínio sólido.",
  conteudo_desconhecido: "Chutou e errou — conteúdo não dominado.",
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
