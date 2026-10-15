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

export type AgendaFieldType = "text" | "date" | "money" | "number"

export type AgendaEventKindField = {
  id: string
  kind_id: string
  label: string
  field_type: AgendaFieldType
  color: string | null
  sort_order: number
}

export type AgendaEventKind = {
  id: string
  user_id: string
  name: string
  fields: AgendaEventKindField[]
}

export type AgendaEventValue = {
  field_id: string
  value_text: string | null
}

export type AgendaEvent = {
  id: string
  user_id: string
  title: string
  event_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  notes: string | null
  color: string
  kind_id: string | null
  values: AgendaEventValue[]
}

/** O que a grade, o mês, o dia e Próximos desenham. */
export type AgendaMarker = {
  id: string
  event_id: string
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
  markers: AgendaMarker[]
  upcoming: AgendaMarker[]
  kinds: AgendaEventKind[]
}

export const NOVO_EDITAL_FIELDS: {
  label: string
  field_type: AgendaFieldType
  color?: string
}[] = [
  { label: "Banca", field_type: "text" },
  { label: "Remuneração", field_type: "money" },
  { label: "Vagas", field_type: "number" },
  { label: "Início da inscrição", field_type: "date", color: "#22c55e" },
  { label: "Fim da inscrição", field_type: "date", color: "#ef4444" },
  { label: "Valor da inscrição", field_type: "money" },
  { label: "Data da realização", field_type: "date", color: "#8b5cf6" },
]

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
