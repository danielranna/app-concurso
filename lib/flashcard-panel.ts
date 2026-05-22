import { supabaseServer } from "./supabase-server"
import { isDueForToday, isOverdue } from "./flashcard-due"
import { ensureSubjectDecks } from "./flashcard-subjects"

export type PanelFilter = "due_today" | "overdue" | "all"

export function cardPreview(row: {
  type: string
  front_text: string | null
  cloze_text: string | null
}): string {
  return (
    row.front_text ||
    row.cloze_text?.replace(/\{\{c\d+::/g, "").replace(/\}\}/g, "").slice(0, 120) ||
    (row.type === "cloze_image" ? "(imagem)" : "—")
  )
}

type CardRow = {
  id: string
  deck_id: string
  type: string
  front_text: string | null
  cloze_text: string | null
  flashcard_decks: { id: string; name: string; subject_id: string | null } | { id: string; name: string; subject_id: string | null }[]
  flashcard_states: { due_at: string } | { due_at: string }[]
}

function deckOf(row: CardRow) {
  return Array.isArray(row.flashcard_decks)
    ? row.flashcard_decks[0]
    : row.flashcard_decks
}

function dueOf(row: CardRow): string | null {
  const st = Array.isArray(row.flashcard_states)
    ? row.flashcard_states[0]
    : row.flashcard_states
  return st?.due_at ?? null
}

export async function fetchPanelData(
  userId: string,
  options: {
    filter: PanelFilter
    subjectId?: string
    deckId?: string
    orphanOnly?: boolean
  }
) {
  const now = new Date()
  const { subjects: subjectDecks, orphan_deck_ids } = await ensureSubjectDecks(userId)

  const { data: cards, error: cardsErr } = await supabaseServer
    .from("flashcards")
    .select(
      `
      id, deck_id, type, front_text, cloze_text,
      flashcard_decks ( id, name, subject_id ),
      flashcard_states ( due_at )
    `
    )
    .eq("user_id", userId)

  if (cardsErr) throw cardsErr

  const allCards = (cards ?? []) as unknown as CardRow[]

  const statsForDeck = (deckId: string) => {
    const deckCards = allCards.filter((c) => c.deck_id === deckId)
    let dueToday = 0
    let overdue = 0
    for (const c of deckCards) {
      const due = dueOf(c)
      if (!due) continue
      const d = new Date(due)
      if (isOverdue(d, now)) overdue++
      if (isDueForToday(d, now)) dueToday++
    }
    return {
      card_count: deckCards.length,
      due_today: dueToday,
      overdue,
    }
  }

  const subjects = subjectDecks.map((s) => ({
    id: s.subject_id,
    name: s.name,
    deck_id: s.deck_id,
    ...statsForDeck(s.deck_id),
  }))

  const orphanStats = orphan_deck_ids.reduce(
    (acc, deckId) => {
      const st = statsForDeck(deckId)
      acc.card_count += st.card_count
      acc.due_today += st.due_today
      acc.overdue += st.overdue
      return acc
    },
    { card_count: 0, due_today: 0, overdue: 0 }
  )

  let activeDeckId: string | null = null
  if (options.subjectId) {
    activeDeckId = subjects.find((s) => s.id === options.subjectId)?.deck_id ?? null
  } else if (options.deckId) {
    activeDeckId = options.deckId
  }

  let filtered = allCards
  if (options.orphanOnly && orphan_deck_ids.length > 0) {
    const orphanSet = new Set(orphan_deck_ids)
    filtered = filtered.filter((c) => orphanSet.has(c.deck_id))
  } else if (activeDeckId) {
    filtered = filtered.filter((c) => c.deck_id === activeDeckId)
  }

  const list = filtered
    .map((c) => {
      const due = dueOf(c)
      const d = deckOf(c)
      const dueDate = due ? new Date(due) : null
      const subject = subjects.find((s) => s.deck_id === c.deck_id)
      return {
        id: c.id,
        deck_id: c.deck_id,
        deck_name: subject?.name ?? d?.name ?? "—",
        subject_id: d?.subject_id ?? subject?.id ?? null,
        type: c.type,
        preview: cardPreview(c),
        due_at: due,
        is_overdue: dueDate ? isOverdue(dueDate, now) : false,
        is_due_today: dueDate ? isDueForToday(dueDate, now) : true,
      }
    })
    .filter((c) => {
      if (options.filter === "all") return true
      if (options.filter === "overdue") return c.is_overdue
      return c.is_due_today
    })
    .sort((a, b) => {
      const ta = a.due_at ? new Date(a.due_at).getTime() : Infinity
      const tb = b.due_at ? new Date(b.due_at).getTime() : Infinity
      return ta - tb
    })

  const scopedForTotals = filtered
  const cardsOut = list.map((c) => ({
    ...c,
    subject_name: subjects.find((s) => s.id === c.subject_id)?.name ?? null,
  }))

  const countDueToday = (rows: CardRow[]) =>
    rows.filter((c) => {
      const due = dueOf(c)
      return isDueForToday(due ? new Date(due) : null, now)
    }).length
  const countOverdue = (rows: CardRow[]) =>
    rows.filter((c) => {
      const due = dueOf(c)
      return due && isOverdue(new Date(due), now)
    }).length

  return {
    subjects,
    orphan: orphanStats.card_count > 0 ? { ...orphanStats, deck_ids: orphan_deck_ids } : null,
    cards: cardsOut,
    totals: {
      due_today: countDueToday(scopedForTotals),
      overdue: countOverdue(scopedForTotals),
      all: scopedForTotals.length,
    },
  }
}
