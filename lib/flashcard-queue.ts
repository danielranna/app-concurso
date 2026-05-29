import { State } from "ts-fsrs"
import { supabaseServer } from "./supabase-server"
import { DEFAULT_WEEKDAY_LIMITS, type FlashcardRow, type WeekdayLimits } from "./flashcard-types"
import { isEligibleForStudy } from "./flashcard-due"
import { applyDeferToQueue } from "./flashcard-study-order"
import { deserializeFsrsCard } from "./fsrs-scheduler"

const STATE_PRIORITY: Record<number, number> = {
  [State.Learning]: 0,
  [State.Relearning]: 1,
  [State.Review]: 2,
  [State.New]: 3,
}

export async function getScheduleSettings(userId: string) {
  const { data } = await supabaseServer
    .from("flashcard_schedule_settings")
    .select("weekday_limits")
    .eq("user_id", userId)
    .maybeSingle()

  return (data?.weekday_limits as WeekdayLimits) ?? DEFAULT_WEEKDAY_LIMITS
}

export function getTodayLimit(limits: WeekdayLimits, date = new Date()): number | null {
  const day = String(date.getDay())
  const val = limits[day]
  return val === undefined || val === null ? null : val
}

export function endOfDay(date = new Date()): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function startOfYesterday(date = new Date()): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfYesterday(date = new Date()): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  d.setHours(23, 59, 59, 999)
  return d
}

type DueRow = {
  id: string
  card_id: string
  due_at: string
  state_data: Record<string, unknown>
  flashcards: FlashcardRow & { flashcard_decks: { name: string; fsrs_parameters: Record<string, unknown> } }
}

export async function fetchDueStates(
  userId: string,
  options?: {
    deckId?: string
    subjectId?: string
    includeNew?: boolean
    before?: Date
    dueNowOnly?: boolean
  }
) {
  const before = options?.before ?? endOfDay()

  let query = supabaseServer
    .from("flashcard_states")
    .select(
      `
      id,
      card_id,
      due_at,
      state_data,
      flashcards!inner (
        id,
        user_id,
        deck_id,
        type,
        front_text,
        back_text,
        cloze_text,
        image_url,
        image_occluded_url,
        image_masks,
        flashcard_decks ( name, fsrs_parameters )
      )
    `
    )
    .eq("user_id", userId)
    .lte("due_at", before.toISOString())
    .order("due_at", { ascending: true })

  if (options?.deckId) {
    query = query.eq("flashcards.deck_id", options.deckId)
  }

  let subjectDeckIds: string[] | null = null
  if (options?.subjectId) {
    const { data: subjectDecks } = await supabaseServer
      .from("flashcard_decks")
      .select("id")
      .eq("user_id", userId)
      .eq("subject_id", options.subjectId)
    subjectDeckIds = (subjectDecks ?? []).map((d) => d.id)
  }

  const { data, error } = await query
  if (error) throw error

  let rows = (data ?? []) as unknown as DueRow[]

  if (subjectDeckIds) {
    rows = rows.filter((r) => subjectDeckIds!.includes(r.flashcards.deck_id))
  }

  if (!options?.includeNew) {
    rows = rows.filter((r) => {
      const st = deserializeFsrsCard(r.state_data)
      return st.state !== State.New
    })
  }

  rows.sort((a, b) => {
    const sa = deserializeFsrsCard(a.state_data).state
    const sb = deserializeFsrsCard(b.state_data).state
    const pa = STATE_PRIORITY[sa] ?? 9
    const pb = STATE_PRIORITY[sb] ?? 9
    if (pa !== pb) return pa - pb
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  })

  if (options?.dueNowOnly) {
    const now = new Date()
    rows = rows.filter((r) => new Date(r.due_at) <= now)
  }

  return rows
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Embaralha dentro de cada faixa de prioridade (learning, relearning, review, new). */
export function shuffleStudyQueue(rows: DueRow[]): DueRow[] {
  if (rows.length <= 1) return rows

  const buckets = new Map<number, DueRow[]>()
  for (const row of rows) {
    const st = deserializeFsrsCard(row.state_data).state
    const p = STATE_PRIORITY[st] ?? 9
    if (!buckets.has(p)) buckets.set(p, [])
    buckets.get(p)!.push(row)
  }

  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .flatMap((p) => shuffleArray(buckets.get(p)!))
}

export async function getStudyQueue(
  userId: string,
  options?: { deckId?: string; subjectId?: string; deferCardIds?: string[] }
): Promise<{
  rows: DueRow[]
  limit: number | null
  totalDue: number
  laterCount: number
  nextDueAt: string | null
}> {
  const limits = await getScheduleSettings(userId)
  const limit = getTodayLimit(limits)
  const now = new Date()

  const allToday = await fetchDueStates(userId, {
    deckId: options?.deckId,
    subjectId: options?.subjectId,
    includeNew: true,
    before: endOfDay(),
  })
  const studyDue = allToday.filter((r) =>
    isEligibleForStudy(r.due_at, r.state_data, now)
  )
  const shuffled = shuffleStudyQueue(studyDue)
  const ordered = applyDeferToQueue(shuffled, options?.deferCardIds ?? [])
  const totalDue = studyDue.length
  const capped = limit === null ? ordered : ordered.slice(0, limit)

  const laterToday = allToday.filter(
    (r) => !isEligibleForStudy(r.due_at, r.state_data, now)
  )
  const nextDueMs = laterToday.length
    ? Math.min(...laterToday.map((r) => new Date(r.due_at).getTime()))
    : null

  return {
    rows: capped,
    limit,
    totalDue,
    laterCount: laterToday.length,
    nextDueAt: nextDueMs ? new Date(nextDueMs).toISOString() : null,
  }
}

export async function getPendingForBot(userId: string) {
  const yesterdayStart = startOfYesterday()
  const yesterdayEnd = endOfYesterday()
  const todayEnd = endOfDay()

  const { data: states } = await supabaseServer
    .from("flashcard_states")
    .select("id, card_id, due_at, state_data")
    .eq("user_id", userId)
    .lte("due_at", todayEnd.toISOString())

  const overdueYesterday: string[] = []
  const dueToday: string[] = []

  for (const s of states ?? []) {
    const due = new Date(s.due_at)
    if (due <= yesterdayEnd) {
      overdueYesterday.push(s.card_id)
    } else if (due <= todayEnd) {
      dueToday.push(s.card_id)
    }
  }

  const allIds = [...new Set([...overdueYesterday, ...dueToday])]
  return {
    count: allIds.length,
    overdue_yesterday: overdueYesterday.length,
    due_today: dueToday.length,
    card_ids: allIds,
  }
}
