export type FlashcardType = "basic" | "cloze_text" | "cloze_image"

export type ImageMask = {
  x: number
  y: number
  w: number
  h: number
}

export type WeekdayLimits = Record<string, number | null>

export type FlashcardRow = {
  id: string
  user_id: string
  deck_id: string
  type: FlashcardType
  front_text: string | null
  back_text: string | null
  cloze_text: string | null
  image_url: string | null
  image_occluded_url: string | null
  image_masks: ImageMask[] | null
  created_at: string
  flashcard_decks?: { name: string }
}

export type FlashcardStateRow = {
  id: string
  user_id: string
  card_id: string
  due_at: string
  state_data: Record<string, unknown>
}

export const DEFAULT_WEEKDAY_LIMITS: WeekdayLimits = {
  "0": null,
  "1": null,
  "2": null,
  "3": null,
  "4": null,
  "5": null,
  "6": null,
}

export type UserFsrsSettings = {
  request_retention?: number
  learning_steps?: readonly string[]
  relearning_steps?: readonly string[]
  w?: number[]
  optimized_at?: string
}

export const DEFAULT_REQUEST_RETENTION = 0.85

export const DEFAULT_FSRS_PARAMS = {
  request_retention: DEFAULT_REQUEST_RETENTION,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["1m", "10m"] as const,
  relearning_steps: ["10m"] as const,
}
