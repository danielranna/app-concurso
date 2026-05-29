import { NextResponse } from "next/server"
import { cardBackPayload, cardFrontPayload } from "@/lib/flashcard-content"
import { getStudyQueue } from "@/lib/flashcard-queue"
import {
  buildScheduler,
  deserializeFsrsCard,
  previewLabels,
} from "@/lib/fsrs-scheduler"
import type { FSRSParameters } from "ts-fsrs"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const deck_id = searchParams.get("deck_id") ?? undefined
  const subject_id = searchParams.get("subject_id") ?? undefined
  const defer_card_ids = (searchParams.get("defer_card_ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  try {
    const { rows, limit, totalDue, laterCount, nextDueAt } = await getStudyQueue(user_id, {
      deckId: deck_id,
      subjectId: subject_id,
      deferCardIds: defer_card_ids.length ? defer_card_ids : undefined,
    })

    if (rows.length === 0) {
      return NextResponse.json({
        card: null,
        remaining: 0,
        total_due: totalDue,
        daily_limit: limit,
        later_count: laterCount,
        next_due_at: nextDueAt,
      })
    }

    const row = rows[0]
    const fc = row.flashcards
    const deckParams = (fc.flashcard_decks?.fsrs_parameters ?? {}) as Partial<FSRSParameters>
    const fsrsCard = deserializeFsrsCard(row.state_data)
    const scheduler = buildScheduler(deckParams)
    const preview = scheduler.repeat(fsrsCard, new Date())

    return NextResponse.json({
      state_id: row.id,
      card: {
        id: fc.id,
        type: fc.type,
        deck_id: fc.deck_id,
        deck_name: fc.flashcard_decks?.name,
        front: cardFrontPayload(fc as never, false),
        back: cardBackPayload(fc as never),
      },
      preview: previewLabels(preview),
      remaining: rows.length - 1,
      total_due: totalDue,
      daily_limit: limit,
      later_count: laterCount,
      next_due_at: nextDueAt,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
