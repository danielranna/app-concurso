import { supabaseServer } from "./supabase-server"
import {
  DEFAULT_BLOCK_COLOR,
  type AgendaBlockException,
  type AgendaBlockExceptionAction,
  type AgendaDayBlockView,
  type AgendaEvent,
  type AgendaEventKind,
  type AgendaEventKindField,
  type AgendaEventValue,
  type AgendaFieldType,
  type AgendaRange,
  type AgendaWeeklyBlock,
  type IsoWeekday,
} from "./agenda-types"
import {
  markersInRange,
  pickUpcomingMarkers,
  projectAgendaDays,
  projectEventMarkers,
} from "./agenda-project"
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

function missingColorColumn(message: string) {
  return /color/i.test(message) && /column|schema cache|does not exist|Could not find/i.test(message)
}

function blocksFromRows(rows: unknown): AgendaWeeklyBlock[] {
  return ((rows ?? []) as BlockRow[]).map((row) => mapBlockRow(row))
}

export async function listAllWeeklyBlocks(userId: string): Promise<AgendaWeeklyBlock[]> {
  const ordered = supabaseServer
    .from("agenda_weekly_blocks")
    .select(
      "id, user_id, start_time, end_time, title, color, sort_order, agenda_weekly_block_days(weekday)"
    )
    .eq("user_id", userId)
    .order("start_time", { ascending: true })
    .order("sort_order", { ascending: true })

  const first = await ordered
  if (!first.error) return blocksFromRows(first.data)

  if (!missingColorColumn(first.error.message)) throw new Error(first.error.message)

  const legacy = await supabaseServer
    .from("agenda_weekly_blocks")
    .select(
      "id, user_id, start_time, end_time, title, sort_order, agenda_weekly_block_days(weekday)"
    )
    .eq("user_id", userId)
    .order("start_time", { ascending: true })
    .order("sort_order", { ascending: true })

  if (legacy.error) throw new Error(legacy.error.message)
  return blocksFromRows(legacy.data)
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

  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => mapEventRow(row))
    .filter((ev) => {
      if (ev.kind_id || !ev.event_date) return false
      const end = ev.end_date ?? ev.event_date
      return end >= fromDate
    })
}

export async function createEvent(input: {
  user_id: string
  title: string
  event_date?: string | null
  end_date?: string | null
  start_time?: string | null
  end_time?: string | null
  notes?: string | null
  color?: string
  kind_id?: string | null
  values?: AgendaEventValue[]
}): Promise<AgendaEvent> {
  if (input.kind_id) {
    await assertOwnsKind(input.kind_id, input.user_id)
    const values = await sanitizeKindValues(input.kind_id, input.values ?? [])
    const { data, error } = await supabaseServer
      .from("agenda_events")
      .insert({
        user_id: input.user_id,
        kind_id: input.kind_id,
        title: input.title.trim(),
        event_date: null,
        end_date: null,
        notes: input.notes?.trim() || null,
        color: input.color ?? "#3b82f6",
        start_time: null,
        end_time: null,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single()
    if (error || !data) throw new Error(error?.message ?? "Falha ao criar evento")
    await replaceEventValues(String((data as { id: string }).id), values)
    return mapEventRow(data as Record<string, unknown>, values)
  }

  if (!input.event_date) throw new Error("Informe a data do evento")
  const times = normalizeEventTimes(input.start_time, input.end_time)
  const { data, error } = await supabaseServer
    .from("agenda_events")
    .insert({
      user_id: input.user_id,
      kind_id: null,
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
  return mapEventRow(data as Record<string, unknown>)
}

export async function updateEvent(input: {
  id: string
  user_id: string
  title: string
  event_date?: string | null
  end_date?: string | null
  start_time?: string | null
  end_time?: string | null
  notes?: string | null
  color?: string
  kind_id?: string | null
  values?: AgendaEventValue[]
}): Promise<AgendaEvent> {
  if (input.kind_id) {
    await assertOwnsKind(input.kind_id, input.user_id)
    const values = await sanitizeKindValues(input.kind_id, input.values ?? [])
    const { data, error } = await supabaseServer
      .from("agenda_events")
      .update({
        kind_id: input.kind_id,
        title: input.title.trim(),
        event_date: null,
        end_date: null,
        notes: input.notes?.trim() || null,
        color: input.color ?? "#3b82f6",
        start_time: null,
        end_time: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("user_id", input.user_id)
      .select("*")
      .single()
    if (error || !data) throw new Error(error?.message ?? "Falha ao salvar evento")
    await replaceEventValues(input.id, values)
    return mapEventRow(data as Record<string, unknown>, values)
  }

  if (!input.event_date) throw new Error("Informe a data do evento")
  const times = normalizeEventTimes(input.start_time, input.end_time)
  const { data, error } = await supabaseServer
    .from("agenda_events")
    .update({
      kind_id: null,
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
  await replaceEventValues(input.id, [])
  return mapEventRow(data as Record<string, unknown>)
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
  const [blocks, punctual, upcomingPool, planResult, exceptionResult, kinds] = await Promise.all([
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
    listEventKinds(userId),
  ])

  if (planResult.error) throw new Error(planResult.error.message)
  if (exceptionResult.error) throw new Error(exceptionResult.error.message)

  const fields = kinds.flatMap((kind) => kind.fields)
  const [rangeSheets, upcomingSheets] = await Promise.all([
    listSheetsWithDateInRange(userId, fields, fromDate, toDate),
    listSheetsWithDateInRange(userId, fields, today, "9999-12-31"),
  ])
  const sheets = uniqueEvents([...rangeSheets, ...upcomingSheets])
  const seenMarkers = new Map<string, ReturnType<typeof projectEventMarkers>[number]>()
  for (const marker of projectEventMarkers({
    punctual: [...punctual, ...upcomingPool],
    sheets,
    fields,
  })) {
    seenMarkers.set(marker.id, marker)
  }
  const allMarkers = [...seenMarkers.values()]
  const markers = markersInRange(allMarkers, fromDate, toDate)

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
    events: uniqueEvents([...punctual, ...upcomingPool, ...sheets]),
    markers,
    upcoming: pickUpcomingMarkers(allMarkers, today),
    kinds,
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
  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => mapEventRow(row))
    .filter((event) => !event.kind_id && event.event_date)
}

function mapEventRow(row: Record<string, unknown>, values: AgendaEventValue[] = []): AgendaEvent {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title ?? ""),
    event_date: row.event_date ? String(row.event_date).slice(0, 10) : null,
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : null,
    start_time: (row.start_time as string | null) ?? null,
    end_time: (row.end_time as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    color: String(row.color ?? "#3b82f6"),
    kind_id: (row.kind_id as string | null) ?? null,
    values,
  }
}

function uniqueEvents(events: AgendaEvent[]): AgendaEvent[] {
  const byId = new Map<string, AgendaEvent>()
  for (const event of events) {
    const prev = byId.get(event.id)
    byId.set(event.id, prev && prev.values.length > event.values.length ? prev : event)
  }
  return [...byId.values()]
}

function missingKindSchema(message: string) {
  return (
    /agenda_event_kind|agenda_event_values|kind_id/i.test(message) &&
    /does not exist|schema cache|Could not find/i.test(message)
  )
}

function parseFieldType(raw: string): AgendaFieldType {
  if (raw === "text" || raw === "date" || raw === "money" || raw === "number") return raw
  throw new Error("Tipo de campo inválido")
}

export async function listEventKinds(userId: string): Promise<AgendaEventKind[]> {
  const { data, error } = await supabaseServer
    .from("agenda_event_kinds")
    .select("id, user_id, name")
    .eq("user_id", userId)
    .order("name", { ascending: true })

  if (error) {
    if (missingKindSchema(error.message)) return []
    throw new Error(error.message)
  }

  const kinds = (data ?? []) as { id: string; user_id: string; name: string }[]
  if (!kinds.length) return []

  const { data: fieldRows, error: fieldError } = await supabaseServer
    .from("agenda_event_kind_fields")
    .select("id, kind_id, label, field_type, color, sort_order")
    .in("kind_id", kinds.map((kind) => kind.id))
    .order("sort_order", { ascending: true })

  if (fieldError) throw new Error(fieldError.message)

  const fields = ((fieldRows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    kind_id: String(row.kind_id),
    label: String(row.label ?? ""),
    field_type: parseFieldType(String(row.field_type)),
    color: (row.color as string | null) ?? null,
    sort_order: Number(row.sort_order ?? 0),
  }))

  return kinds.map((kind) => ({
    ...kind,
    fields: fields.filter((field) => field.kind_id === kind.id),
  }))
}

async function assertOwnsKind(kindId: string, userId: string): Promise<void> {
  const { data, error } = await supabaseServer
    .from("agenda_event_kinds")
    .select("id")
    .eq("id", kindId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Tipo de evento não encontrado")
}

async function sanitizeKindValues(kindId: string, values: AgendaEventValue[]): Promise<AgendaEventValue[]> {
  const { data, error } = await supabaseServer
    .from("agenda_event_kind_fields")
    .select("id, field_type")
    .eq("kind_id", kindId)
  if (error) throw new Error(error.message)
  const allowed = new Map(
    ((data ?? []) as { id: string; field_type: string }[]).map((field) => [field.id, field.field_type])
  )
  return values
    .filter((value) => allowed.has(value.field_id))
    .map((value) => ({
      field_id: value.field_id,
      value_text: value.value_text?.trim() || null,
    }))
    .filter((value) => value.value_text)
}

async function replaceEventValues(eventId: string, values: AgendaEventValue[]): Promise<void> {
  const { error: delError } = await supabaseServer
    .from("agenda_event_values")
    .delete()
    .eq("event_id", eventId)
  if (delError) {
    if (missingKindSchema(delError.message)) return
    throw new Error(delError.message)
  }
  if (!values.length) return
  const { error } = await supabaseServer.from("agenda_event_values").insert(
    values.map((value) => ({
      event_id: eventId,
      field_id: value.field_id,
      value_text: value.value_text,
      updated_at: new Date().toISOString(),
    }))
  )
  if (error) throw new Error(error.message)
}

async function listSheetsWithDateInRange(
  userId: string,
  fields: AgendaEventKindField[],
  fromDate: string,
  toDate: string
): Promise<AgendaEvent[]> {
  const dateFieldIds = fields.filter((field) => field.field_type === "date").map((field) => field.id)
  if (!dateFieldIds.length) return []

  const { data, error } = await supabaseServer
    .from("agenda_event_values")
    .select("event_id, value_text")
    .in("field_id", dateFieldIds)
    .gte("value_text", fromDate)
    .lte("value_text", toDate)
    .order("value_text", { ascending: true })
    .limit(80)

  if (error) {
    if (missingKindSchema(error.message)) return []
    throw new Error(error.message)
  }

  const eventIds = [...new Set(((data ?? []) as { event_id: string }[]).map((row) => row.event_id))]
  return listEventsByIds(userId, eventIds)
}

async function listEventsByIds(userId: string, ids: string[]): Promise<AgendaEvent[]> {
  if (!ids.length) return []
  const { data, error } = await supabaseServer
    .from("agenda_events")
    .select("*")
    .eq("user_id", userId)
    .in("id", ids)
  if (error) throw new Error(error.message)

  const { data: valueRows, error: valueError } = await supabaseServer
    .from("agenda_event_values")
    .select("event_id, field_id, value_text")
    .in("event_id", ids)
  if (valueError) throw new Error(valueError.message)

  const valuesByEvent = new Map<string, AgendaEventValue[]>()
  for (const row of (valueRows ?? []) as { event_id: string; field_id: string; value_text: string | null }[]) {
    const list = valuesByEvent.get(row.event_id) ?? []
    list.push({ field_id: row.field_id, value_text: row.value_text })
    valuesByEvent.set(row.event_id, list)
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapEventRow(row, valuesByEvent.get(String(row.id)) ?? [])
  )
}

export async function createEventKind(input: {
  user_id: string
  name: string
  fields: { label: string; field_type: AgendaFieldType; color?: string | null }[]
}): Promise<AgendaEventKind> {
  const name = input.name.trim()
  if (!name) throw new Error("Dê um nome ao tipo")
  const fields = normalizeKindFields(input.fields)
  const { data, error } = await supabaseServer
    .from("agenda_event_kinds")
    .insert({ user_id: input.user_id, name, updated_at: new Date().toISOString() })
    .select("id, user_id, name")
    .single()
  if (error || !data) throw new Error(kindError(error?.message ?? "Falha ao criar tipo"))

  const kind = data as { id: string; user_id: string; name: string }
  if (!fields.length) return { ...kind, fields: [] }

  const { data: inserted, error: fieldError } = await supabaseServer
    .from("agenda_event_kind_fields")
    .insert(
      fields.map((field, index) => ({
        kind_id: kind.id,
        label: field.label,
        field_type: field.field_type,
        color: field.field_type === "date" ? field.color : null,
        sort_order: index,
      }))
    )
    .select("id, kind_id, label, field_type, color, sort_order")
  if (fieldError) throw new Error(fieldError.message)
  return {
    ...kind,
    fields: ((inserted ?? []) as Record<string, unknown>[]).map(mapFieldRow),
  }
}

export async function updateEventKind(input: {
  id: string
  user_id: string
  name: string
  fields: {
    id?: string | null
    label: string
    field_type: AgendaFieldType
    color?: string | null
  }[]
}): Promise<AgendaEventKind> {
  await assertOwnsKind(input.id, input.user_id)
  const name = input.name.trim()
  if (!name) throw new Error("Dê um nome ao tipo")
  const fields = normalizeKindFields(input.fields)
  const { error } = await supabaseServer
    .from("agenda_event_kinds")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("user_id", input.user_id)
  if (error) throw new Error(error.message)

  const { data: existing, error: existingError } = await supabaseServer
    .from("agenda_event_kind_fields")
    .select("id")
    .eq("kind_id", input.id)
  if (existingError) throw new Error(existingError.message)

  const keep = new Set(fields.map((field) => field.id).filter((id): id is string => Boolean(id)))
  const remove = ((existing ?? []) as { id: string }[])
    .map((field) => field.id)
    .filter((id) => !keep.has(id))
  if (remove.length) {
    const { error: delError } = await supabaseServer
      .from("agenda_event_kind_fields")
      .delete()
      .in("id", remove)
    if (delError) throw new Error(delError.message)
  }

  for (const [index, field] of fields.entries()) {
    const payload = {
      kind_id: input.id,
      label: field.label,
      field_type: field.field_type,
      color: field.field_type === "date" ? field.color : null,
      sort_order: index,
    }
    if (field.id) {
      const { error: updError } = await supabaseServer
        .from("agenda_event_kind_fields")
        .update(payload)
        .eq("id", field.id)
        .eq("kind_id", input.id)
      if (updError) throw new Error(updError.message)
    } else {
      const { error: insError } = await supabaseServer.from("agenda_event_kind_fields").insert(payload)
      if (insError) throw new Error(insError.message)
    }
  }

  const kinds = await listEventKinds(input.user_id)
  const updated = kinds.find((kind) => kind.id === input.id)
  if (!updated) throw new Error("Tipo de evento não encontrado")
  return updated
}

export async function deleteEventKind(id: string, userId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("agenda_event_kinds")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
  if (error) throw new Error(kindError(error.message))
}

function normalizeKindFields<T extends { label: string; field_type: AgendaFieldType; color?: string | null; id?: string | null }>(
  fields: T[]
): T[] {
  return fields
    .map((field) => ({ ...field, label: field.label.trim(), field_type: parseFieldType(field.field_type) }))
    .filter((field) => field.label)
    .map((field) => {
      if (field.field_type === "date" && !field.color?.trim()) {
        throw new Error(`Escolha uma cor para a data "${field.label}"`)
      }
      return field
    })
}

function mapFieldRow(row: Record<string, unknown>): AgendaEventKindField {
  return {
    id: String(row.id),
    kind_id: String(row.kind_id),
    label: String(row.label ?? ""),
    field_type: parseFieldType(String(row.field_type)),
    color: (row.color as string | null) ?? null,
    sort_order: Number(row.sort_order ?? 0),
  }
}

function kindError(message: string) {
  if (missingKindSchema(message)) {
    return "Execute sql-agenda-event-kinds.sql no Supabase."
  }
  return message
}
