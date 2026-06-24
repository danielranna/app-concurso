import { computeParameters } from "@open-spaced-repetition/binding"
import { supabaseServer } from "./supabase-server"
import {
  buildTrainingItems,
  optimizerEligibility,
  type ReviewRow,
} from "./fsrs-training-items"

export {
  MIN_CARDS_FOR_OPTIMIZE,
  MIN_REVIEWS_FOR_OPTIMIZE,
  buildTrainingItems,
} from "./fsrs-training-items"

export async function fetchUserReviewLogs(userId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabaseServer
    .from("flashcard_review_logs")
    .select("card_id, rating, reviewed_at")
    .eq("user_id", userId)
    .order("reviewed_at", { ascending: true })

  if (error) throw error
  return (data ?? []) as ReviewRow[]
}

export async function getOptimizerStatus(userId: string) {
  const logs = await fetchUserReviewLogs(userId)
  return optimizerEligibility(logs)
}

export async function optimizeUserFsrsParams(userId: string): Promise<{
  w: number[]
  review_count: number
  card_count: number
}> {
  const logs = await fetchUserReviewLogs(userId)
  const status = optimizerEligibility(logs)
  if (!status.can_optimize) {
    throw new Error(
      `Precisa de pelo menos ${status.min_reviews} revisões em ${status.min_cards} cards (você tem ${status.review_count} revisões em ${status.card_count} cards).`
    )
  }

  const items = buildTrainingItems(logs)
  const w = await computeParameters(items, {
    enableShortTerm: true,
    numRelearningSteps: 1,
    timeout: 120,
  })

  return { w, review_count: status.review_count, card_count: status.card_count }
}
