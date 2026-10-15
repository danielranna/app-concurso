/** 1 = segunda … 7 = domingo (ISO) */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const DEFAULT_BLOCK_COLOR = "#1e293b"

export type AgendaWeeklyBlock = {
  id: string
  user_id: string
  weekdays: IsoWeekday[]
  start_time: string
  end_time: string
  title: string
  color: string
  sort_order: number
}

export type AgendaBlockExceptionAction = "skip" | "reschedule"

export type AgendaBlockException = {
  id: string
  user_id: string
  weekly_block_id: string
  agenda_date: string
  action: AgendaBlockExceptionAction
  start_time: string | null
  end_time: string | null
  title: string | null
}

export type AgendaDayBlockView = AgendaWeeklyBlock & {
  plan_text: string | null
  plan_id: string | null
  exception_id: string | null
  skipped: boolean
}

export type AgendaProjectedDay = {
  date: string
  weekday: IsoWeekday
  blocks: AgendaDayBlockView[]
}

export type AgendaEvent = {
  id: string
  user_id: string
  title: string
  event_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  notes: string | null
  color: string
}

export type AgendaRange = {
  from: string
  to: string
  days: AgendaProjectedDay[]
  events: AgendaEvent[]
  upcoming: AgendaEvent[]
}

/** @deprecated use AgendaWeeklyBlock */
export type AgendaDailyBlock = {
  id: string
  user_id: string
  agenda_date: string
  start_time: string
  end_time: string
  title: string
  notes: string | null
}
