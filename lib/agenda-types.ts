/** 1 = segunda … 7 = domingo (ISO) */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type AgendaWeeklyBlock = {
  id: string
  user_id: string
  weekday: IsoWeekday
  start_time: string
  end_time: string
  title: string
  sort_order: number
}

export type AgendaDayBlockView = AgendaWeeklyBlock & {
  plan_text: string | null
  plan_id: string | null
}

export type AgendaEvent = {
  id: string
  user_id: string
  title: string
  event_date: string
  end_date: string | null
  notes: string | null
  color: string
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
