import { supabaseServer } from "./supabase-server"
import type { AgendaDailyBlock, AgendaEvent } from "./agenda-types"

export async function listDailyBlocks(
  userId: string,
  agendaDate: string
): Promise<AgendaDailyBlock[]> {
  const { data, error } = await supabaseServer
    .from("agenda_daily_blocks")
    .select("*")
    .eq("user_id", userId)
    .eq("agenda_date", agendaDate)
    .order("start_time", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as AgendaDailyBlock[]
}

export async function createDailyBlock(input: {
  user_id: string
  agenda_date: string
  start_time: string
  end_time: string
  title: string
  notes?: string | null
}): Promise<AgendaDailyBlock> {
  const { data, error } = await supabaseServer
    .from("agenda_daily_blocks")
    .insert({
      user_id: input.user_id,
      agenda_date: input.agenda_date,
      start_time: input.start_time,
      end_time: input.end_time,
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as AgendaDailyBlock
}

export async function deleteDailyBlock(id: string, userId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("agenda_daily_blocks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

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
