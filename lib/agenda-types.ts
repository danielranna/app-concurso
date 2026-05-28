export type AgendaDailyBlock = {
  id: string
  user_id: string
  agenda_date: string
  start_time: string
  end_time: string
  title: string
  notes: string | null
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
