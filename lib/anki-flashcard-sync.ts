import { supabaseServer } from "./supabase-server"

export function ankiNoteId(value: unknown) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

function missingMirror(message: string) {
  return /anki_note_id|anki_review_queue|column|relation|schema cache/i.test(message)
}

export async function loadFlashcardSchedule(cardId: string) {
  const withNote = await supabaseServer
    .from("flashcards")
    .select("deck_id, anki_note_id")
    .eq("id", cardId)
    .maybeSingle()

  if (withNote.error && missingMirror(withNote.error.message)) {
    const plain = await supabaseServer
      .from("flashcards")
      .select("deck_id")
      .eq("id", cardId)
      .maybeSingle()
    return { deckId: plain.data?.deck_id ? String(plain.data.deck_id) : "", ankiNoteId: 0 }
  }

  return {
    deckId: withNote.data?.deck_id ? String(withNote.data.deck_id) : "",
    ankiNoteId: ankiNoteId(withNote.data?.anki_note_id),
  }
}

/** Guarda a nota para o Anki aplicar. A data só muda quando o Anki responder. */
export async function queueAnkiReview(
  userId: string,
  cardId: string,
  noteId: number,
  rating: number
) {
  const { error } = await supabaseServer.from("anki_review_queue").upsert(
    {
      user_id: userId,
      flashcard_id: cardId,
      anki_note_id: noteId,
      rating,
    },
    { onConflict: "user_id,flashcard_id" }
  )
  if (error) {
    if (missingMirror(error.message)) {
      throw new Error("Rode o SQL do flashcard sincronizado com o Anki.")
    }
    throw new Error(error.message)
  }

  await supabaseServer
    .from("flashcard_states")
    .update({
      state_data: { scheduler: "anki", anki_pending: true },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("card_id", cardId)

  return { pending_anki: true as const, due_at: null, scheduled_days: null }
}
