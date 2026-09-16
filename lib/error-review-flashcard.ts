import { supabaseServer } from "./supabase-server"
import { ensureCardState } from "./flashcard-review"
import { mergeFsrsParams } from "./fsrs-params-merge"
import type { FSRSParameters } from "ts-fsrs"

export const ERROR_REVIEW_DECK_NAME = "Revisão de Erros"
export const ERROR_REVIEW_RETENTION_DEFAULT = 0.85
export const ERROR_REVIEW_RETENTION_MIN = 0.8
export const ERROR_REVIEW_RETENTION_MAX = 0.9

export function clampErrorReviewRetention(value: number): number {
  return Math.min(
    ERROR_REVIEW_RETENTION_MAX,
    Math.max(ERROR_REVIEW_RETENTION_MIN, value)
  )
}

export async function ensureErrorReviewDeck(userId: string): Promise<string> {
  const { data: existing } = await supabaseServer
    .from("flashcard_decks")
    .select("id, fsrs_parameters")
    .eq("user_id", userId)
    .eq("name", ERROR_REVIEW_DECK_NAME)
    .maybeSingle()

  if (existing?.id) {
    const params = (existing.fsrs_parameters ?? {}) as Record<string, unknown>
    if (params.request_retention == null) {
      await supabaseServer
        .from("flashcard_decks")
        .update({
          fsrs_parameters: {
            ...params,
            request_retention: ERROR_REVIEW_RETENTION_DEFAULT,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
    }
    return existing.id
  }

  const { data, error } = await supabaseServer
    .from("flashcard_decks")
    .insert({
      user_id: userId,
      name: ERROR_REVIEW_DECK_NAME,
      fsrs_parameters: {
        request_retention: ERROR_REVIEW_RETENTION_DEFAULT,
      },
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  return data.id as string
}

/** Params FSRS só do deck de erros (não herda retenção global dos flashcards). */
export async function resolveErrorReviewFsrsParams(
  userId: string
): Promise<Partial<FSRSParameters>> {
  const deckId = await ensureErrorReviewDeck(userId)
  const { data } = await supabaseServer
    .from("flashcard_decks")
    .select("fsrs_parameters")
    .eq("id", deckId)
    .maybeSingle()

  const deck = (data?.fsrs_parameters ?? {}) as Record<string, unknown>
  const retention = clampErrorReviewRetention(
    Number(deck.request_retention ?? ERROR_REVIEW_RETENTION_DEFAULT)
  )
  return mergeFsrsParams({
    ...deck,
    request_retention: retention,
  })
}

export async function getErrorReviewRetention(userId: string): Promise<{
  deck_id: string
  request_retention: number
}> {
  const deckId = await ensureErrorReviewDeck(userId)
  const { data } = await supabaseServer
    .from("flashcard_decks")
    .select("fsrs_parameters")
    .eq("id", deckId)
    .maybeSingle()
  const params = (data?.fsrs_parameters ?? {}) as { request_retention?: number }
  return {
    deck_id: deckId,
    request_retention: clampErrorReviewRetention(
      Number(params.request_retention ?? ERROR_REVIEW_RETENTION_DEFAULT)
    ),
  }
}

export async function setErrorReviewRetention(
  userId: string,
  retention: number
): Promise<{ deck_id: string; request_retention: number }> {
  const deckId = await ensureErrorReviewDeck(userId)
  const next = clampErrorReviewRetention(retention)
  const { data } = await supabaseServer
    .from("flashcard_decks")
    .select("fsrs_parameters")
    .eq("id", deckId)
    .maybeSingle()
  const prev = (data?.fsrs_parameters ?? {}) as Record<string, unknown>
  await supabaseServer
    .from("flashcard_decks")
    .update({
      fsrs_parameters: { ...prev, request_retention: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", deckId)
    .eq("user_id", userId)
  return { deck_id: deckId, request_retention: next }
}

export function encodeErrorReviewBack(params: {
  answer: "Certo" | "Errado"
  explanation: string
  knowledgeSummary?: string
}) {
  return JSON.stringify({
    kind: "error_review_ce",
    answer: params.answer,
    explanation: params.explanation,
    knowledge_summary: params.knowledgeSummary ?? null,
  })
}

export function decodeErrorReviewBack(backText: string | null): {
  answer: "Certo" | "Errado"
  explanation: string
  knowledge_summary: string | null
} | null {
  if (!backText?.trim()) return null
  try {
    const parsed = JSON.parse(backText) as {
      kind?: string
      answer?: string
      explanation?: string
      knowledge_summary?: string | null
    }
    if (parsed.kind !== "error_review_ce") return null
    const answer =
      String(parsed.answer ?? "").toLowerCase() === "errado" ? "Errado" : "Certo"
    return {
      answer,
      explanation: String(parsed.explanation ?? ""),
      knowledge_summary: parsed.knowledge_summary
        ? String(parsed.knowledge_summary)
        : null,
    }
  } catch {
    const first = backText.trim().split(/\n/)[0]?.trim().toLowerCase()
    if (first === "certo" || first === "errado") {
      return {
        answer: first === "errado" ? "Errado" : "Certo",
        explanation: backText.replace(/^(certo|errado)\s*/i, "").trim(),
        knowledge_summary: null,
      }
    }
    return null
  }
}

export async function findActiveCardForKnowledgeKey(
  userId: string,
  knowledgeKey: string
): Promise<{ flashcardId: string; errorId: string } | null> {
  if (!knowledgeKey) return null

  const { data } = await supabaseServer
    .from("errors")
    .select("id, active_flashcard_id")
    .eq("user_id", userId)
    .eq("knowledge_key", knowledgeKey)
    .not("active_flashcard_id", "is", null)
    .limit(20)

  for (const row of data ?? []) {
    if (!row.active_flashcard_id) continue
    const { data: card } = await supabaseServer
      .from("flashcards")
      .select("id")
      .eq("id", row.active_flashcard_id)
      .eq("user_id", userId)
      .maybeSingle()
    if (card?.id) {
      return { flashcardId: card.id, errorId: row.id as string }
    }
  }
  return null
}

export async function createErrorReviewFlashcard(params: {
  userId: string
  errorId: string
  statement: string
  answer: "Certo" | "Errado"
  explanation: string
  knowledgeSummary: string
}): Promise<string> {
  const deckId = await ensureErrorReviewDeck(params.userId)
  const back = encodeErrorReviewBack({
    answer: params.answer,
    explanation: params.explanation,
    knowledgeSummary: params.knowledgeSummary,
  })

  const { data: card, error } = await supabaseServer
    .from("flashcards")
    .insert({
      user_id: params.userId,
      deck_id: deckId,
      type: "basic",
      front_text: params.statement.trim(),
      back_text: back,
      source_error_id: params.errorId,
    })
    .select("id")
    .single()

  if (error && /source_error_id|column/i.test(error.message)) {
    const retry = await supabaseServer
      .from("flashcards")
      .insert({
        user_id: params.userId,
        deck_id: deckId,
        type: "basic",
        front_text: params.statement.trim(),
        back_text: back,
      })
      .select("id")
      .single()
    if (retry.error) throw new Error(retry.error.message)
    await ensureCardState(params.userId, retry.data.id)
    return retry.data.id as string
  }

  if (error) throw new Error(error.message)

  await ensureCardState(params.userId, card.id)
  return card.id as string
}

export async function linkErrorsToFlashcard(params: {
  userId: string
  knowledgeKey: string
  flashcardId: string
  errorIds: string[]
}) {
  const ids = [...new Set(params.errorIds.filter(Boolean))]
  if (!ids.length) return

  await supabaseServer
    .from("errors")
    .update({
      active_flashcard_id: params.flashcardId,
      learning_status: "em_revisao",
      knowledge_key: params.knowledgeKey,
    })
    .eq("user_id", params.userId)
    .in("id", ids)
}
