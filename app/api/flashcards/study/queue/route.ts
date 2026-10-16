import { NextResponse } from "next/server"
import { ankiNoteId } from "@/lib/anki-flashcard-sync"
import { cardBackPayload, cardFrontPayload } from "@/lib/flashcard-content"
import { resolveFsrsParams } from "@/lib/flashcard-fsrs-params"
import { getStudyQueue } from "@/lib/flashcard-queue"
import {
  buildScheduler,
  deserializeFsrsCard,
  previewLabels,
} from "@/lib/fsrs-scheduler"

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
    const { rows, limit, totalDue, laterCount, nextDueAt, ankiWaiting } = await getStudyQueue(user_id, {
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
        anki_waiting: ankiWaiting,
      })
    }

    const row = rows[0]
    const fc = row.flashcards
    const anki = ankiNoteId((fc as { anki_note_id?: unknown }).anki_note_id) > 0
    const deckParams = anki ? null : await resolveFsrsParams(user_id, fc.deck_id)
    const preview = anki
      ? null
      : previewLabels(buildScheduler(deckParams ?? {}).repeat(deserializeFsrsCard(row.state_data), new Date()))

    return NextResponse.json({
      state_id: row.id,
      card: {
        id: fc.id,
        type: fc.type,
        deck_id: fc.deck_id,
        deck_name: fc.flashcard_decks?.name,
        scheduler: anki ? "anki" : "app",
        front: cardFrontPayload(fc as never, false),
        back: cardBackPayload(fc as never),
      },
      preview,
      anki_waiting: ankiWaiting,
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
