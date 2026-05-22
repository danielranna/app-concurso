import type { FlashcardRow, FlashcardType } from "./flashcard-types"

export function renderClozeFront(text: string, reveal = false): string {
  if (reveal) {
    return text.replace(/\{\{c\d+::([^}]+)\}\}/g, "<mark>$1</mark>")
  }
  return text.replace(/\{\{c\d+::([^}]+)\}\}/g, "[...]")
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim()
}

export function cardFrontPayload(card: FlashcardRow, reveal = false) {
  if (card.type === "basic") {
    return { text: card.front_text ?? "", image_url: null as string | null }
  }
  if (card.type === "cloze_text") {
    const raw = card.cloze_text ?? ""
    const text = reveal ? renderClozeFront(raw, true) : renderClozeFront(raw, false)
    return { text, image_url: null as string | null }
  }
  return {
    text: null as string | null,
    image_url: reveal ? card.image_url : card.image_occluded_url ?? card.image_url,
  }
}

export function cardBackPayload(card: FlashcardRow) {
  if (card.type === "basic") {
    return { text: card.back_text ?? "", image_url: null as string | null }
  }
  if (card.type === "cloze_text") {
    return { text: renderClozeFront(card.cloze_text ?? "", true), image_url: null as string | null }
  }
  return { text: null as string | null, image_url: card.image_url }
}

export function wrapClozeSelection(text: string, selection: string, index: number): string {
  const marker = `{{c${index}::${selection}}}`
  return text.replace(selection, marker)
}

export function nextClozeIndex(text: string): number {
  const matches = text.match(/\{\{c(\d+)::/g)
  if (!matches?.length) return 1
  const nums = matches.map((m) => parseInt(m.replace(/\{\{c(\d+)::/, "$1"), 10))
  return Math.max(...nums) + 1
}

export type BotCardPayload = {
  card_id: string
  type: FlashcardType
  deck_name: string
  front: { text: string | null; image_url: string | null }
  on_reveal: { text: string | null; image_url: string | null }
}

export function toBotPayload(card: FlashcardRow): BotCardPayload {
  const deckName = card.flashcard_decks?.name ?? "Baralho"
  return {
    card_id: card.id,
    type: card.type,
    deck_name: deckName,
    front: cardFrontPayload(card, false),
    on_reveal: cardBackPayload(card),
  }
}
