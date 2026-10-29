export const WIDGET_TEC_URL = "https://www.tecconcursos.com.br"

export const WIDGET_PERIODS = ["hoje", "7d", "30d", "90d", "all"] as const

export type WidgetPeriod = (typeof WIDGET_PERIODS)[number]

export const WIDGET_PERIOD_LABELS: Record<WidgetPeriod, string> = {
  hoje: "Hoje",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  all: "Tudo",
}

export function isWidgetPeriod(value: string): value is WidgetPeriod {
  return (WIDGET_PERIODS as readonly string[]).includes(value)
}

export type WidgetNow = {
  id: string
  title: string
  start_time: string
  end_time: string
  plan_text: string | null
  status: "active" | "next"
}

export type WidgetUpcoming = {
  id: string
  title: string
  event_date: string
  date_label: string
  start_time: string | null
  color: string
}

export type WidgetCycle = {
  subject: string | null
  detail: string | null
  completed: number
  total: number
  progress_pct: number
}

export type WidgetSubjectStat = {
  name: string
  short_label: string
  correct_pct: number
  total: number
}

export type WidgetSummary = {
  period: WidgetPeriod
  agenda: {
    date: string
    date_label: string
    weekday_label: string
    now: WidgetNow | null
    upcoming: WidgetUpcoming[]
    today_events: WidgetUpcoming[]
  }
  study: {
    flashcards_due: number
    cycle: WidgetCycle | null
  }
  stats: {
    summary: {
      total_attempts: number
      correct: number
      wrong: number
      correct_pct: number
      subject_count: number
    }
    by_subject: WidgetSubjectStat[]
    study_ms: number
    study_hours_label: string
  }
  links: {
    tec: string
    app: string
  }
}
