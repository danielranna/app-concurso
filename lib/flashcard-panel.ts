import { supabaseServer } from "./supabase-server"
import { endOfDay } from "./flashcard-queue"

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
    deckId?: string
    subjectId?: string
  }
) {
  const now = new Date()
  const todayEnd = endOfDay()

  const [{ data: subjects }, { data: decks }, { data: cards, error: cardsErr }] =
    await Promise.all([
      supabaseServer
        .from("subjects")
        .select("id, name")
        .eq("user_id", userId)
        .order("name"),
      supabaseServer
        .from("flashcard_decks")
        .select("id, name, subject_id")
        .eq("user_id", userId)
        .order("name"),
      supabaseServer
        .from("flashcards")
        .select(
          `
          id, deck_id, type, front_text, cloze_text,
          flashcard_decks ( id, name, subject_id ),
          flashcard_states ( due_at )
        `
        )
        .eq("user_id", userId),
    ])

  if (cardsErr) throw cardsErr

  const allCards = (cards ?? []) as unknown as CardRow[]

  const deckStats = (deckId: string) => {
    const deckCards = allCards.filter((c) => c.deck_id === deckId)
    let dueToday = 0
    let overdue = 0
    for (const c of deckCards) {
      const due = dueOf(c)
      if (!due) continue
      const d = new Date(due)
      if (d < now) overdue++
      if (d <= todayEnd) dueToday++
    }
    return { total: deckCards.length, due_today: dueToday, overdue }
  }

  type DeckNode = {
    id: string
    name: string
    subject_id: string | null
    card_count: number
    due_today: number
    overdue: number
  }

  const deckNodes: DeckNode[] = (decks ?? []).map((d) => {
    const stats = deckStats(d.id)
    return {
      id: d.id,
      name: d.name,
      subject_id: d.subject_id ?? null,
      card_count: stats.total,
      due_today: stats.due_today,
      overdue: stats.overdue,
    }
  })

  const subjectGroups = (subjects ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    decks: deckNodes.filter((d) => d.subject_id === s.id),
    due_today: 0,
    overdue: 0,
    card_count: 0,
  }))

  for (const g of subjectGroups) {
    g.due_today = g.decks.reduce((n, d) => n + d.due_today, 0)
    g.overdue = g.decks.reduce((n, d) => n + d.overdue, 0)
    g.card_count = g.decks.reduce((n, d) => n + d.card_count, 0)
  }

  const uncategorizedDecks = deckNodes.filter((d) => !d.subject_id)

  let filtered = allCards

  if (options.deckId) {
    filtered = filtered.filter((c) => c.deck_id === options.deckId)
  } else if (options.subjectId) {
    const deckIds = new Set(
      deckNodes.filter((d) => d.subject_id === options.subjectId).map((d) => d.id)
    )
    filtered = filtered.filter((c) => deckIds.has(c.deck_id))
  }

  const list = filtered
    .map((c) => {
      const due = dueOf(c)
      const d = deckOf(c)
      const dueDate = due ? new Date(due) : null
      return {
        id: c.id,
        deck_id: c.deck_id,
        deck_name: d?.name ?? "—",
        subject_id: d?.subject_id ?? null,
        type: c.type,
        preview: cardPreview(c),
        due_at: due,
        is_overdue: dueDate ? dueDate < now : false,
        is_due_today: dueDate ? dueDate <= todayEnd : false,
      }
    })
    .filter((c) => {
      if (options.filter === "all") return true
      if (!c.due_at) return options.filter === "due_today"
      if (options.filter === "overdue") return c.is_overdue
      return c.is_due_today
    })
    .sort((a, b) => {
      const ta = a.due_at ? new Date(a.due_at).getTime() : Infinity
      const tb = b.due_at ? new Date(b.due_at).getTime() : Infinity
      return ta - tb
    })

  const subjectNameById = Object.fromEntries((subjects ?? []).map((s) => [s.id, s.name]))

  return {
    subjects: subjectGroups,
    uncategorized_decks: uncategorizedDecks,
    cards: list.map((c) => ({
      ...c,
      subject_name: c.subject_id ? subjectNameById[c.subject_id] ?? null : null,
    })),
    totals: {
      due_today: allCards.filter((c) => {
        const due = dueOf(c)
        return due && new Date(due) <= todayEnd
      }).length,
      overdue: allCards.filter((c) => {
        const due = dueOf(c)
        return due && new Date(due) < now
      }).length,
      all: allCards.length,
    },
  }
}
