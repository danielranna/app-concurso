import { State } from "ts-fsrs"

export type LearningStatus = "novo_erro" | "em_revisao" | "consolidado"

/** Heurística visual — fácil de alterar; NÃO altera o FSRS. */
const CONSOLIDADO_MIN_SCHEDULED_DAYS = 14
const CONSOLIDADO_MIN_STABILITY = 10
const CONSOLIDADO_MIN_REPS = 3

export const LEARNING_STATUS_LABELS: Record<LearningStatus, string> = {
  novo_erro: "Novo erro",
  em_revisao: "Em revisão",
  consolidado: "Consolidado",
}

export const CONSOLIDATED_STATUS_HINT =
  "Histórico recente indica domínio estável segundo os critérios do sistema."

/**
 * Espelho visual do estado FSRS + reincidências.
 * Again / reincidência → nunca consolidado.
 */
export function deriveLearningStatus(input: {
  fsrsState?: number | null
  scheduledDays?: number | null
  stability?: number | null
  reps?: number | null
  lastRating?: number | null
  recurrenceCount?: number | null
  hasActiveCard?: boolean
}): LearningStatus {
  const recurrence = Math.max(0, Number(input.recurrenceCount ?? 1))
  const lastRating = input.lastRating == null ? null : Number(input.lastRating)

  if (lastRating === 1) return "em_revisao"
  if (recurrence > 1 && lastRating !== 3 && lastRating !== 4) {
    return "em_revisao"
  }

  if (!input.hasActiveCard && (input.reps == null || Number(input.reps) <= 0)) {
    return "novo_erro"
  }

  const state = Number(input.fsrsState ?? State.New)
  const scheduledDays = Number(input.scheduledDays ?? 0)
  const stability = Number(input.stability ?? 0)
  const reps = Number(input.reps ?? 0)

  const candidate =
    state === State.Review &&
    reps >= CONSOLIDADO_MIN_REPS &&
    (scheduledDays >= CONSOLIDADO_MIN_SCHEDULED_DAYS ||
      stability >= CONSOLIDADO_MIN_STABILITY) &&
    lastRating !== 1

  if (candidate) return "consolidado"

  if (reps > 0 || input.hasActiveCard) return "em_revisao"
  return "novo_erro"
}
