"use client"

import type { AgendaMarker, AgendaProjectedDay } from "@/lib/agenda-types"
import { timeToMinutes } from "@/lib/agenda-now"
import {
  agendaGridBounds,
  eventCoversDate,
  eventSpanEnd,
  isAllDayEvent,
  layoutDayLanes,
  visibleBlocks,
} from "@/lib/agenda-project"
import { formatTimeShort, formatWeekdayShort, toDateInputValue } from "@/lib/home-date"

const HOUR_PX = 52
const BLOCK_GAP_Y = 6
const BLOCK_GAP_X = 5

type Props = {
  weekDays: Date[]
  days: AgendaProjectedDay[]
  events: AgendaMarker[]
  onOpenDay: (date: Date) => void
  onEditEvent: (event: AgendaMarker) => void
}

type GridItem = {
  key: string
  start_time: string
  end_time: string
  title: string
  subtitle: string | null
  color: string | null
  kind: "block" | "event"
  event?: AgendaMarker
}

export default function AgendaWeekGrid({
  weekDays,
  days,
  events,
  onOpenDay,
  onEditEvent,
}: Props) {
  const byDate = new Map(days.map((day) => [day.date, day]))
  const columns = weekDays.map((date) => {
    const key = toDateInputValue(date)
    const day = byDate.get(key)
    const blocks = visibleBlocks(day?.blocks ?? [])
    const covering = events.filter((event) => eventCoversDate(event, key))
    return {
      date,
      key,
      allDay: covering.filter((event) => isAllDayEvent(event)),
      items: layoutDayLanes<GridItem>([
        ...blocks.map((block) => ({
          key: `block-${block.id}`,
          start_time: block.start_time,
          end_time: block.end_time,
          title: block.title,
          subtitle: block.plan_text,
          color: block.color,
          kind: "block" as const,
        })),
        ...covering
          .filter((event) => event.start_time)
          .map((event) => ({
            key: `event-${event.id}`,
            start_time: event.start_time!,
            end_time: eventSpanEnd(event.start_time!, event.end_time),
            title: event.title,
            subtitle: null,
            color: event.color,
            kind: "event" as const,
            event,
          })),
      ]),
    }
  })

  const bounds = agendaGridBounds(
    columns.flatMap((column) => column.items),
    []
  )
  const hours: number[] = []
  for (let hour = bounds.startHour; hour < bounds.endHour; hour++) hours.push(hour)
  const height = (bounds.endHour - bounds.startHour) * HOUR_PX
  const hasAllDay = columns.some((column) => column.allDay.length > 0)
  const today = toDateInputValue(new Date())

  function topFor(time: string) {
    return ((timeToMinutes(time) - bounds.startHour * 60) / 60) * HOUR_PX + BLOCK_GAP_Y / 2
  }

  function heightFor(start: string, end: string) {
    const minutes = Math.max(timeToMinutes(end) - timeToMinutes(start), 20)
    return Math.max((minutes / 60) * HOUR_PX - BLOCK_GAP_Y, 20)
  }

  const gridCols = "grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] gap-x-2"

  return (
    <div className="w-full overflow-visible rounded-lg border border-slate-200">
      <div className="w-full">
        <div className={`sticky top-0 z-20 border-b border-slate-200 bg-white ${gridCols}`}>
          <div />
          {columns.map((column) => {
            const isToday = column.key === today
            return (
              <button
                key={column.key}
                type="button"
                onClick={() => onOpenDay(column.date)}
                className={`border-l border-slate-100 px-1 py-2 text-left text-xs font-semibold ${
                  isToday ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="capitalize">{formatWeekdayShort(column.date)}</span>{" "}
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 ${
                    isToday ? "bg-blue-600 text-white" : ""
                  }`}
                >
                  {column.date.getDate()}
                </span>
              </button>
            )
          })}
        </div>

        {hasAllDay && (
          <div className={`border-b border-slate-200 bg-slate-50/80 ${gridCols}`}>
            <div className="px-1 py-1 text-[10px] text-slate-400">dia</div>
            {columns.map((column) => (
              <div key={column.key} className="space-y-0.5 border-l border-slate-100 p-1">
                {column.allDay.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onEditEvent(event)}
                    className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium text-white"
                    style={{ backgroundColor: event.color }}
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className={gridCols}>
          <div className="relative" style={{ height }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute right-1 text-[10px] text-slate-400"
                style={{ top: (hour - bounds.startHour) * HOUR_PX + 2 }}
              >
                {String(hour).padStart(2, "0")}h
              </div>
            ))}
          </div>
          {columns.map((column) => (
            <div
              key={column.key}
              className={`relative border-l border-slate-100 ${
                column.key === today ? "bg-blue-50/40" : "bg-white"
              }`}
              style={{ height }}
            >
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-slate-100"
                  style={{ top: (hour - bounds.startHour) * HOUR_PX }}
                />
              ))}
              {column.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    item.kind === "event" && item.event
                      ? onEditEvent(item.event)
                      : onOpenDay(column.date)
                  }
                  className="absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight text-white"
                  style={{
                    top: topFor(item.start_time),
                    height: heightFor(item.start_time, item.end_time),
                    left: `calc(${(item.lane / item.lanes) * 100}% + ${BLOCK_GAP_X}px)`,
                    width: `calc(${100 / item.lanes}% - ${BLOCK_GAP_X * 2}px)`,
                    backgroundColor: item.color ?? undefined,
                  }}
                  title={`${formatTimeShort(item.start_time)} ${item.title}`}
                >
                  <span className="block truncate font-semibold">{item.title}</span>
                  {item.subtitle && <span className="block truncate opacity-80">{item.subtitle}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
