import { supabaseServer } from "./supabase-server"

export type SubjectDeck = {
  subject_id: string
  name: string
  deck_id: string
}

/** Uma matéria = um baralho; cria ou sincroniza automaticamente. */
export async function ensureSubjectDecks(userId: string): Promise<{
  subjects: SubjectDeck[]
  orphan_deck_ids: string[]
}> {
  const { data: subjectRows, error: subErr } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)
    .order("name")

  if (subErr) throw subErr

  const { data: deckRows, error: deckErr } = await supabaseServer
    .from("flashcard_decks")
    .select("id, name, subject_id")
    .eq("user_id", userId)

  if (deckErr) throw deckErr

  const decks = deckRows ?? []
  const bySubject = new Map<string, { id: string; name: string }>()

  for (const d of decks) {
    if (d.subject_id) {
      if (!bySubject.has(d.subject_id)) {
        bySubject.set(d.subject_id, { id: d.id, name: d.name })
      }
    }
  }

  const subjects: SubjectDeck[] = []

  for (const s of subjectRows ?? []) {
    let deck = bySubject.get(s.id)

    if (deck) {
      if (deck.name !== s.name) {
        await supabaseServer
          .from("flashcard_decks")
          .update({ name: s.name, updated_at: new Date().toISOString() })
          .eq("id", deck.id)
        deck = { id: deck.id, name: s.name }
        bySubject.set(s.id, deck)
      }
    } else {
      const { data: created, error: insErr } = await supabaseServer
        .from("flashcard_decks")
        .insert({
          user_id: userId,
          name: s.name,
          subject_id: s.id,
        })
        .select("id, name")
        .single()

      if (insErr) throw insErr
      deck = { id: created.id, name: created.name }
      bySubject.set(s.id, deck)
    }

    subjects.push({
      subject_id: s.id,
      name: s.name,
      deck_id: deck.id,
    })
  }

  const subjectNames = new Map(
    (subjectRows ?? []).map((s) => [s.name.trim().toLowerCase(), s.id])
  )

  for (const d of decks.filter((x) => !x.subject_id)) {
    const matchId = subjectNames.get(d.name.trim().toLowerCase())
    if (matchId && !bySubject.has(matchId)) {
      await supabaseServer
        .from("flashcard_decks")
        .update({ subject_id: matchId, updated_at: new Date().toISOString() })
        .eq("id", d.id)
      bySubject.set(matchId, { id: d.id, name: d.name })
      const idx = subjects.findIndex((s) => s.subject_id === matchId)
      if (idx >= 0) subjects[idx].deck_id = d.id
    }
  }

  const linkedDeckIds = new Set(subjects.map((s) => s.deck_id))
  const orphan_deck_ids = decks
    .filter((d) => !linkedDeckIds.has(d.id))
    .map((d) => d.id)

  return { subjects, orphan_deck_ids }
}

export async function deckIdForSubject(
  userId: string,
  subjectId: string
): Promise<string | null> {
  const { subjects } = await ensureSubjectDecks(userId)
  return subjects.find((s) => s.subject_id === subjectId)?.deck_id ?? null
}
