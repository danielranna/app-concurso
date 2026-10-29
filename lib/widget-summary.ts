import { getAgendaNowStatus } from "./agenda-now"
import { visibleBlocks } from "./agenda-project"
import { getAgendaRange, getDayPlan } from "./agenda"
import type { AgendaDayBlockView } from "./agenda-types"
import { fetchPanelData } from "./flashcard-panel"
import { formatStudyDuration } from "./format-study-duration"
import { formatTimeShort, isoWeekdayFromDate, isoWeekdayLabel, parseDateInput } from "./home-date"
import { fetchQuestionStatistics } from "./question-statistics"
import { getQuestionStudyMs } from "./study-hours"
import { getQueueState } from "./study-cycle-queue"
import { loadCycleWithQueue, realignQueuePositionsDb } from "./study-cycle-queue-db"
import {
  WIDGET_TEC_URL,
  type WidgetCycle,
  type WidgetNow,
  type WidgetPeriod,
  type WidgetSummary,
} from "./widget-types"

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function dateLabel(iso: string): string {
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}

function dayMonthLabel(iso: string): string {
  const [, month, day] = iso.split("-")
  const name = MONTHS[Number(month) - 1] ?? month
  return `${Number(day)} ${name}`
}

function toNow(block: AgendaDayBlockView, status: WidgetNow["status"]): WidgetNow {
  return {
    id: block.id,
    title: block.title,
    start_time: formatTimeShort(block.start_time),
    end_time: formatTimeShort(block.end_time),
    plan_text: block.plan_text,
    status,
  }
}

/** Bloco que o cartão mostra em Agora: o que está no horário, senão o próximo de hoje. */
export function pickAgendaNow(blocks: AgendaDayBlockView[], clock: Date): WidgetNow | null {
  const status = getAgendaNowStatus(visibleBlocks(blocks), clock)
  if (!status) return null
  if (status.kind === "active") {
    const block = status.active[0]
    return block ? toNow(block, "active") : null
  }
  if (status.kind === "before" || status.kind === "between") {
    return toNow(status.next, "next")
  }
  return null
}

async function loadCycle(userId: string): Promise<WidgetCycle | null> {
  let cycle = await loadCycleWithQueue(userId)
  if (cycle?.id && cycle.cycle_blocks?.length) {
    const realigned = await realignQueuePositionsDb(cycle.id)
    if (realigned) cycle = (await loadCycleWithQueue(userId)) ?? cycle
  }
  if (!cycle?.cycle_blocks?.length) return null

  const queue = getQueueState(cycle)
  const total = queue.stats.total
  const completed = queue.stats.completed
  const current = queue.current
  const subject = current?.subject_name?.trim() || null
  const detailRaw = current?.content_block_name?.trim() || current?.label?.trim() || null
  const detail = detailRaw && detailRaw !== subject ? detailRaw : null

  return {
    subject,
    detail,
    completed,
    total,
    progress_pct: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}

export async function buildWidgetSummary(input: {
  userId: string
  period: WidgetPeriod
  since: string | null
  today: string
  clock: Date
  appOrigin: string
}): Promise<WidgetSummary> {
  const { userId, period, since, today, clock, appOrigin } = input
  const weekday = isoWeekdayLabel(isoWeekdayFromDate(parseDateInput(today)))

  const [dayPlan, range, panel, cycle, stats, studyMs] = await Promise.all([
    getDayPlan(userId, today),
    getAgendaRange(userId, today, today, today),
    fetchPanelData(userId, { filter: "due_today" }),
    loadCycle(userId),
    fetchQuestionStatistics(userId, { since }),
    getQuestionStudyMs(userId, since),
  ])

  const origin = appOrigin.replace(/\/$/, "")

  return {
    period,
    agenda: {
      date: today,
      date_label: dateLabel(today),
      weekday_label: weekday,
      now: pickAgendaNow(dayPlan.blocks, clock),
      upcoming: range.upcoming.map((marker) => ({
        id: marker.id,
        title: marker.title,
        event_date: marker.event_date,
        date_label: dayMonthLabel(marker.event_date),
        start_time: marker.start_time ? formatTimeShort(marker.start_time) : null,
        color: marker.color,
      })),
      today_events: [...range.markers]
        .sort(
          (a, b) =>
            (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99") ||
            a.title.localeCompare(b.title)
        )
        .map((marker) => ({
          id: marker.id,
          title: marker.title,
          event_date: marker.event_date,
          date_label: dayMonthLabel(marker.event_date),
          start_time: marker.start_time ? formatTimeShort(marker.start_time) : null,
          color: marker.color,
        })),
    },
    study: {
      flashcards_due: panel.totals.due_today,
      cycle,
    },
    stats: {
      summary: stats.summary,
      by_subject: stats.by_subject
        .filter((row) => row.total > 0)
        .map((row) => ({
          name: row.name,
          short_label: row.short_label,
          correct_pct: row.correct_pct,
          total: row.total,
        })),
      study_ms: studyMs,
      study_hours_label: formatStudyDuration(studyMs),
    },
    links: {
      tec: WIDGET_TEC_URL,
      app: `${origin}/`,
    },
  }
}
