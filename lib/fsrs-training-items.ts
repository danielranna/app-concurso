import { FSRSBindingItem, FSRSBindingReview } from "@open-spaced-repetition/binding"
import { dateDiffInDays } from "ts-fsrs"

export const MIN_REVIEWS_FOR_OPTIMIZE = 200
export const MIN_CARDS_FOR_OPTIMIZE = 50

export type ReviewRow = {
  card_id: string
  rating: number
  reviewed_at: string
}

export function buildTrainingItems(logs: ReviewRow[]): FSRSBindingItem[] {
  const byCard = new Map<string, ReviewRow[]>()
  for (const log of logs) {
    if (log.rating < 1 || log.rating > 4) continue
    const list = byCard.get(log.card_id) ?? []
    list.push(log)
    byCard.set(log.card_id, list)
  }

  const items: FSRSBindingItem[] = []
  for (const reviews of byCard.values()) {
    reviews.sort(
      (a, b) => new Date(a.reviewed_at).getTime() - new Date(b.reviewed_at).getTime()
    )
    const bindingReviews: FSRSBindingReview[] = []
    for (let i = 0; i < reviews.length; i++) {
      const prev = i > 0 ? new Date(reviews[i - 1].reviewed_at) : null
      const cur = new Date(reviews[i].reviewed_at)
      const deltaT = prev ? Math.max(0, dateDiffInDays(prev, cur)) : 0
      bindingReviews.push(new FSRSBindingReview(reviews[i].rating, deltaT))
    }
    if (bindingReviews.length > 0) {
      items.push(new FSRSBindingItem(bindingReviews))
    }
  }
  return items
}

export function optimizerEligibility(logs: ReviewRow[]) {
  const cardIds = new Set(logs.map((l) => l.card_id))
  return {
    review_count: logs.length,
    card_count: cardIds.size,
    can_optimize:
      logs.length >= MIN_REVIEWS_FOR_OPTIMIZE && cardIds.size >= MIN_CARDS_FOR_OPTIMIZE,
    min_reviews: MIN_REVIEWS_FOR_OPTIMIZE,
    min_cards: MIN_CARDS_FOR_OPTIMIZE,
  }
}
