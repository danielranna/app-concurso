import { supabaseServer } from "./supabase-server"
import type {
  AgendaDayBlockView,
  AgendaEvent,
  AgendaWeeklyBlock,
  IsoWeekday,
} from "./agenda-types"
import { isoWeekdayFromDate, parseDateInput } from "./home-date"

function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t
}

export async function listWeeklyBlocks(
  userId: string,
  weekday: IsoWeekday
): Promise<AgendaWeeklyBlock[]> {
  const { data, error } = await supabaseServer
    .from("agenda_weekly_blocks")
    .select("*")
    .eq("user_id", userId)
    .eq("weekday", weekday)
    .order("start_time", { ascending: true })
    .order("sort_order", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as AgendaWeeklyBlock[]
}

export async function createWeeklyBlock(input: {
  user_id: string
  weekday: IsoWeekday
  start_time: string
  end_time: string
  title: string
}): Promise<AgendaWeeklyBlock> {
  const { data: existing } = await supabaseServer
    .from("agenda_weekly_blocks")
    .select("sort_order")
    .eq("user_id", input.user_id)
    .eq("weekday", input.weekday)
    .order("sort_order", { ascending: false })
    .limit(1)

  const sort_order = (existing?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabaseServer
    .from("agenda_weekly_blocks")
    .insert({
      user_id: input.user_id,
      weekday: input.weekday,
      start_time: normalizeTime(input.start_time),
      end_time: normalizeTime(input.end_time),
      title: input.title.trim(),
      sort_order,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as AgendaWeeklyBlock
}

export async function deleteWeeklyBlock(id: string, userId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("agenda_weekly_blocks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
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

  const planByBlock = new Map(
    (plans ?? []).map((p) => [
      p.weekly_block_id as string,
      { id: p.id as string, plan_text: (p.plan_text as string | null) ?? null },
    ])
  )

  return {
    weekday,
    blocks: blocks.map((b) => {
      const plan = planByBlock.get(b.id)
      return {
        ...b,
        plan_id: plan?.id ?? null,
        plan_text: plan?.plan_text ?? null,
      }
    }),
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
  notes?: string | null
  color?: string
}): Promise<AgendaEvent> {
  const { data, error } = await supabaseServer
    .from("agenda_events")
    .insert({
      user_id: input.user_id,
      title: input.title.trim(),
      event_date: input.event_date,
      end_date: input.end_date ?? null,
      notes: input.notes?.trim() || null,
      color: input.color ?? "#3b82f6",
      updated_at: new Date().toISOString(),
    })
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
