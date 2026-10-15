import { supabaseServer } from "./supabase-server"
import {
  DEFAULT_BLOCK_COLOR,
  type AgendaBlockException,
  type AgendaBlockExceptionAction,
  type AgendaDayBlockView,
  type AgendaEvent,
  type AgendaRange,
  type AgendaWeeklyBlock,
  type IsoWeekday,
} from "./agenda-types"
import { pickUpcomingEvents, projectAgendaDays } from "./agenda-project"
import { isoWeekdayFromDate, parseDateInput, toDateInputValue } from "./home-date"

function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t
}

function normalizeEventTimes(
  start?: string | null,
  end?: string | null
): { start_time: string | null; end_time: string | null } {
  const start_time = start?.trim() ? normalizeTime(start.trim()) : null
  const end_time = end?.trim() ? normalizeTime(end.trim()) : null
  if (end_time && !start_time) throw new Error("Informe a hora de início")
  if (start_time && end_time && end_time <= start_time) {
    throw new Error("A hora final precisa ser depois do início")
  }
  return { start_time, end_time }
}

function normalizeEventDates(event_date: string, end_date?: string | null): string | null {
  const end = end_date?.trim() || null
  if (end && end < event_date) {
    throw new Error("A data final precisa ser igual ou posterior à data inicial")
  }
  return end
}

type ExceptionRow = {
  id: string
  user_id: string
  weekly_block_id: string
  agenda_date: string
  action: string
  start_time: string | null
  end_time: string | null
  title: string | null
}

function mapExceptionRow(row: ExceptionRow): AgendaBlockException {
  return {
    id: row.id,
    user_id: row.user_id,
    weekly_block_id: row.weekly_block_id,
    agenda_date: String(row.agenda_date).slice(0, 10),
    action: row.action === "reschedule" ? "reschedule" : "skip",
    start_time: row.start_time,
    end_time: row.end_time,
    title: row.title,
  }
}

export function parseWeekdays(raw: unknown): IsoWeekday[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((n) => Number(n))
    .filter((n) => n >= 1 && n <= 7) as IsoWeekday[]
}

type BlockRow = {
  id: string
  user_id: string
  start_time: string
  end_time: string
  title: string
  color?: string | null
  sort_order: number
  agenda_weekly_block_days?: { weekday: number }[] | null
}

function mapBlockRow(row: BlockRow): AgendaWeeklyBlock {
  const days = row.agenda_weekly_block_days ?? []
  const weekdays = days
    .map((d) => d.weekday)
    .filter((n) => n >= 1 && n <= 7)
    .sort((a, b) => a - b) as IsoWeekday[]

  return {
    id: row.id,
    user_id: row.user_id,
    start_time: row.start_time,
    end_time: row.end_time,
    title: row.title,
    color: row.color || DEFAULT_BLOCK_COLOR,
    sort_order: row.sort_order,
    weekdays,
  }
}

const blockSelect = `
  id, user_id, start_time, end_time, title, color, sort_order,
  agenda_weekly_block_days ( weekday )
`

const blockSelectLegacy = `
  id, user_id, start_time, end_time, title, sort_order,
  agenda_weekly_block_days ( weekday )
`

function missingColorColumn(message: string) {
  return /color/i.test(message) && /column|schema cache|does not exist|Could not find/i.test(message)
}

export async function listAllWeeklyBlocks(userId: string): Promise<AgendaWeeklyBlock[]> {
  const query = (columns: string) =>
    supabaseServer
      .from("agenda_weekly_blocks")
      .select(columns)
      .eq("user_id", userId)
      .order("start_time", { ascending: true })
      .order("sort_order", { ascending: true })

  let { data, error } = await query(blockSelect)
  if (error && missingColorColumn(error.message)) {
    const legacy = await query(blockSelectLegacy)
    data = legacy.data
    error = legacy.error
  }

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapBlockRow(row as BlockRow))
}

export async function listWeeklyBlocks(
  userId: string,
  weekday: IsoWeekday
): Promise<AgendaWeeklyBlock[]> {
  const all = await listAllWeeklyBlocks(userId)
  return all.filter((b) => b.weekdays.includes(weekday))
}

export async function createWeeklyBlock(input: {
  user_id: string
  weekdays: IsoWeekday[]
  start_time: string
  end_time: string
  title: string
  color?: string | null
}): Promise<AgendaWeeklyBlock> {
  const weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b)
  if (!weekdays.length) {
    throw new Error("Selecione pelo menos um dia da semana")
  }

  const { data: existing } = await supabaseServer
    .from("agenda_weekly_blocks")
    .select("sort_order")
    .eq("user_id", input.user_id)
    .order("sort_order", { ascending: false })
    .limit(1)

  const sort_order = (existing?.[0]?.sort_order ?? -1) + 1

  const { data: block, error } = await supabaseServer
    .from("agenda_weekly_blocks")
    .insert({
      user_id: input.user_id,
      start_time: normalizeTime(input.start_time),
      end_time: normalizeTime(input.end_time),
      title: input.title.trim(),
      color: input.color?.trim() || DEFAULT_BLOCK_COLOR,
      sort_order,
      updated_at: new Date().toISOString(),
    })
    .select("id, user_id, start_time, end_time, title, color, sort_order")
    .single()

  if (error || !block) {
    const message = error?.message ?? "Falha ao criar bloco"
    if (missingColorColumn(message)) {
      throw new Error("Execute de novo sql-agenda-schedule.sql no Supabase para salvar a cor dos blocos.")
    }
    throw new Error(message)
  }

  const { error: daysErr } = await supabaseServer.from("agenda_weekly_block_days").insert(
    weekdays.map((weekday) => ({ block_id: block.id, weekday }))
  )

  if (daysErr) throw new Error(daysErr.message)

  return {
    ...(block as Omit<AgendaWeeklyBlock, "weekdays">),
    color: (block as { color?: string | null }).color || DEFAULT_BLOCK_COLOR,
    weekdays,
  }
}

export async function deleteWeeklyBlock(id: string, userId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("agenda_weekly_blocks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
}

export async function updateWeeklyBlock(input: {
  id: string
  user_id: string
  weekdays: IsoWeekday[]
  start_time: string
  end_time: string
  title: string
  color?: string | null
}): Promise<AgendaWeeklyBlock> {
  const weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b)
  if (!weekdays.length) throw new Error("Selecione pelo menos um dia da semana")

  const start_time = normalizeTime(input.start_time)
  const end_time = normalizeTime(input.end_time)
  if (end_time <= start_time) {
    throw new Error("O horário final precisa ser depois do início")
  }

  const { data: owned, error: ownErr } = await supabaseServer
    .from("agenda_weekly_blocks")
    .select("id")
    .eq("id", input.id)
    .eq("user_id", input.user_id)
    .maybeSingle()

  if (ownErr) throw new Error(ownErr.message)
  if (!owned) throw new Error("Bloco não encontrado")

  const { error } = await supabaseServer
    .from("agenda_weekly_blocks")
    .update({
      start_time,
      end_time,
      title: input.title.trim(),
      color: input.color?.trim() || DEFAULT_BLOCK_COLOR,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", input.user_id)

  if (error) {
    if (missingColorColumn(error.message)) {
      throw new Error("Execute de novo sql-agenda-schedule.sql no Supabase para salvar a cor dos blocos.")
    }
    throw new Error(error.message)
  }

  const { error: delErr } = await supabaseServer
    .from("agenda_weekly_block_days")
    .delete()
    .eq("block_id", input.id)

  if (delErr) throw new Error(delErr.message)

  const { error: daysErr } = await supabaseServer.from("agenda_weekly_block_days").insert(
    weekdays.map((weekday) => ({ block_id: input.id, weekday }))
  )

  if (daysErr) throw new Error(daysErr.message)

  const blocks = await listAllWeeklyBlocks(input.user_id)
  const updated = blocks.find((block) => block.id === input.id)
  if (!updated) throw new Error("Bloco não encontrado")
  return updated
}

export async function getDayPlan(
  userId: string,
  agendaDate: string
): Promise<{ weekday: IsoWeekday; blocks: AgendaDayBlockView[] }> {
  const weekday = isoWeekdayFromDate(parseDateInput(agendaDate)) as IsoWeekday
  const blocks = await listWeeklyBlocks(userId, weekday)

  if (!blocks.length) {
    return { weekday, blocks: [] }
  }

  const blockIds = blocks.map((b) => b.id)
  const { data: plans, error } = await supabaseServer
    .from("agenda_daily_block_plans")
    .select("id, weekly_block_id, plan_text")
    .eq("user_id", userId)
    .eq("agenda_date", agendaDate)
    .in("weekly_block_id", blockIds)

  if (error) throw new Error(error.message)

  const { data: exceptionRows, error: exErr } = await supabaseServer
    .from("agenda_block_exceptions")
    .select("id, user_id, weekly_block_id, agenda_date, action, start_time, end_time, title")
    .eq("user_id", userId)
    .eq("agenda_date", agendaDate)
    .in("weekly_block_id", blockIds)

  if (exErr) throw new Error(exErr.message)

  const projected = projectAgendaDays({
    from: agendaDate,
    to: agendaDate,
    blocks,
    exceptions: (exceptionRows ?? []).map((row) => mapExceptionRow(row as ExceptionRow)),
    plans: (plans ?? []).map((plan) => ({
      id: plan.id as string,
      agenda_date: agendaDate,
      weekly_block_id: plan.weekly_block_id as string,
      plan_text: (plan.plan_text as string | null) ?? null,
    })),
  })

  return {
    weekday,
    blocks: projected[0]?.blocks ?? [],
  }
}

export async function upsertBlockPlan(input: {
  user_id: string
  agenda_date: string
  weekly_block_id: string
  plan_text: string | null
}): Promise<void> {
  const text = input.plan_text?.trim() || null

  const { error } = await supabaseServer.from("agenda_daily_block_plans").upsert(
    {
      user_id: input.user_id,
      agenda_date: input.agenda_date,
      weekly_block_id: input.weekly_block_id,
      plan_text: text,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,agenda_date,weekly_block_id" }
  )

  if (error) throw new Error(error.message)
}

export async function listEventsInRange(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<AgendaEvent[]> {
  const { data, error } = await supabaseServer
    .from("agenda_events")
    .select("*")
    .eq("user_id", userId)
    .lte("event_date", toDate)
    .order("event_date", { ascending: true })

  if (error) throw new Error(error.message)

  return ((data ?? []) as AgendaEvent[]).filter((ev) => {
    const end = ev.end_date ?? ev.event_date
    return end >= fromDate
  })
}

export async function createEvent(input: {
  user_id: string
  title: string
  event_date: string
  end_date?: string | null
  start_time?: string | null
  end_time?: string | null
  notes?: string | null
  color?: string
}): Promise<AgendaEvent> {
  const times = normalizeEventTimes(input.start_time, input.end_time)
  const { data, error } = await supabaseServer
    .from("agenda_events")
    .insert({
      user_id: input.user_id,
      title: input.title.trim(),
      event_date: input.event_date,
      end_date: normalizeEventDates(input.event_date, input.end_date),
      notes: input.notes?.trim() || null,
      color: input.color ?? "#3b82f6",
      start_time: times.start_time,
      end_time: times.end_time,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as AgendaEvent
}

export async function updateEvent(input: {
  id: string
  user_id: string
  title: string
  event_date: string
  end_date?: string | null
  start_time?: string | null
  end_time?: string | null
  notes?: string | null
  color?: string
}): Promise<AgendaEvent> {
  const times = normalizeEventTimes(input.start_time, input.end_time)
  const { data, error } = await supabaseServer
    .from("agenda_events")
    .update({
      title: input.title.trim(),
      event_date: input.event_date,
      end_date: normalizeEventDates(input.event_date, input.end_date),
      notes: input.notes?.trim() || null,
      color: input.color ?? "#3b82f6",
      start_time: times.start_time,
      end_time: times.end_time,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", input.user_id)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as AgendaEvent
}

export async function deleteEvent(id: string, userId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("agenda_events")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
}

async function assertOwnsBlock(blockId: string, userId: string): Promise<void> {
  const { data, error } = await supabaseServer
    .from("agenda_weekly_blocks")
    .select("id")
    .eq("id", blockId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("Bloco não encontrado")
}

export async function upsertBlockException(input: {
  user_id: string
  weekly_block_id: string
  agenda_date: string
  action: AgendaBlockExceptionAction
  start_time?: string | null
  end_time?: string | null
  title?: string | null
}): Promise<AgendaBlockException> {
  if (input.action !== "skip" && input.action !== "reschedule") {
    throw new Error("Ação inválida")
  }
  await assertOwnsBlock(input.weekly_block_id, input.user_id)

  const times =
    input.action === "reschedule"
      ? normalizeEventTimes(input.start_time, input.end_time)
      : { start_time: null, end_time: null }

  if (input.action === "reschedule" && (!times.start_time || !times.end_time)) {
    throw new Error("Informe o horário deste dia")
  }

  const { data, error } = await supabaseServer
    .from("agenda_block_exceptions")
    .upsert(
      {
        user_id: input.user_id,
        weekly_block_id: input.weekly_block_id,
        agenda_date: input.agenda_date,
        action: input.action,
        start_time: times.start_time,
        end_time: times.end_time,
        title: input.action === "reschedule" ? input.title?.trim() || null : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "weekly_block_id,agenda_date" }
    )
    .select("id, user_id, weekly_block_id, agenda_date, action, start_time, end_time, title")
    .single()

  if (error) throw new Error(error.message)
  return mapExceptionRow(data as ExceptionRow)
}

export async function deleteBlockException(id: string, userId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("agenda_block_exceptions")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
}

export async function getAgendaRange(
  userId: string,
  fromDate: string,
  toDate: string,
  today = toDateInputValue(new Date())
): Promise<AgendaRange> {
  const [blocks, events, upcomingPool, planResult, exceptionResult] = await Promise.all([
    listAllWeeklyBlocks(userId),
    listEventsInRange(userId, fromDate, toDate),
    listUpcomingPool(userId, today),
    supabaseServer
      .from("agenda_daily_block_plans")
      .select("id, agenda_date, weekly_block_id, plan_text")
      .eq("user_id", userId)
      .gte("agenda_date", fromDate)
      .lte("agenda_date", toDate),
    supabaseServer
      .from("agenda_block_exceptions")
      .select("id, user_id, weekly_block_id, agenda_date, action, start_time, end_time, title")
      .eq("user_id", userId)
      .gte("agenda_date", fromDate)
      .lte("agenda_date", toDate),
  ])

  if (planResult.error) throw new Error(planResult.error.message)
  if (exceptionResult.error) throw new Error(exceptionResult.error.message)

  const days = projectAgendaDays({
    from: fromDate,
    to: toDate,
    blocks,
    exceptions: (exceptionResult.data ?? []).map((row) => mapExceptionRow(row as ExceptionRow)),
    plans: (planResult.data ?? []).map((plan) => ({
      id: plan.id as string,
      agenda_date: String(plan.agenda_date).slice(0, 10),
      weekly_block_id: plan.weekly_block_id as string,
      plan_text: (plan.plan_text as string | null) ?? null,
    })),
  })

  return {
    from: fromDate,
    to: toDate,
    days,
    events,
    upcoming: pickUpcomingEvents(upcomingPool, today),
  }
}

async function listUpcomingPool(userId: string, today: string): Promise<AgendaEvent[]> {
  const { data, error } = await supabaseServer
    .from("agenda_events")
    .select("*")
    .eq("user_id", userId)
    .or(`event_date.gte.${today},end_date.gte.${today}`)
    .order("event_date", { ascending: true })
    .limit(40)

  if (error) throw new Error(error.message)
  return (data ?? []) as AgendaEvent[]
}
