import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRSParameters,
  type Grade,
  type IPreview,
  type RecordLogItem,
} from "ts-fsrs"
import { DEFAULT_FSRS_PARAMS } from "./flashcard-types"

export { Rating, State }

export function buildScheduler(deckParams?: Partial<FSRSParameters>) {
  const params = generatorParameters({
    ...DEFAULT_FSRS_PARAMS,
    ...(deckParams ?? {}),
  } as Partial<FSRSParameters>)
  return fsrs(params)
}

export function emptyFsrsCard(): Card {
  return createEmptyCard(new Date())
}

export function serializeFsrsCard(card: Card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state,
    last_review: card.last_review?.toISOString() ?? null,
  }
}

export function deserializeFsrsCard(data: Record<string, unknown>): Card {
  return {
    due: new Date(data.due as string),
    stability: Number(data.stability ?? 0),
    difficulty: Number(data.difficulty ?? 0),
    elapsed_days: Number(data.elapsed_days ?? 0),
    scheduled_days: Number(data.scheduled_days ?? 0),
    reps: Number(data.reps ?? 0),
    lapses: Number(data.lapses ?? 0),
    learning_steps: Number(data.learning_steps ?? 0),
    state: Number(data.state ?? State.New) as State,
    last_review: data.last_review ? new Date(data.last_review as string) : undefined,
  }
}

export function ratingFromNumber(n: number): Grade {
  if (n === 1) return Rating.Again
  if (n === 2) return Rating.Hard
  if (n === 3) return Rating.Good
  if (n === 4) return Rating.Easy
  throw new Error("rating deve ser 1-4")
}

export function applyReview(
  fsrsCard: Card,
  rating: number,
  deckParams?: Partial<FSRSParameters>
): { card: Card; log: RecordLogItem; preview: ReturnType<ReturnType<typeof buildScheduler>["repeat"]> } {
  const scheduler = buildScheduler(deckParams)
  const now = new Date()
  const preview = scheduler.repeat(fsrsCard, now)
  const result = scheduler.next(fsrsCard, now, ratingFromNumber(rating))
  return { card: result.card, log: result, preview }
}

/** Dias até a próxima revisão (usa `due`; passos curtos têm scheduled_days = 0). */
export function intervalDaysUntilDue(card: Card, now: Date): number {
  const ms = card.due.getTime() - now.getTime()
  return Math.max(0, ms / (1000 * 60 * 60 * 24))
}

export function formatIntervalDays(days: number): string {
  if (days < 1 / 1440) return "< 1 min"
  if (days < 1 / 24) {
    const mins = Math.max(1, Math.round(days * 24 * 60))
    return `${mins} min`
  }
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24))
    return `${hours} h`
  }
  const d = Math.round(days)
  return d === 1 ? "1 dia" : `${d} dias`
}

export function previewLabels(preview: IPreview, now = new Date()) {
  return {
    again: formatIntervalDays(intervalDaysUntilDue(preview[Rating.Again].card, now)),
    hard: formatIntervalDays(intervalDaysUntilDue(preview[Rating.Hard].card, now)),
    good: formatIntervalDays(intervalDaysUntilDue(preview[Rating.Good].card, now)),
    easy: formatIntervalDays(intervalDaysUntilDue(preview[Rating.Easy].card, now)),
  }
}
