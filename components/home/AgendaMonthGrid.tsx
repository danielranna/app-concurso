"use client"

import type { AgendaEvent, AgendaProjectedDay } from "@/lib/agenda-types"
import { eventCoversDate, visibleBlocks } from "@/lib/agenda-project"
import { toDateInputValue } from "@/lib/home-date"

type Props = {
  cells: Date[]
  month: number
  days: AgendaProjectedDay[]
  events: AgendaEvent[]
  onOpenDay: (date: Date) => void
}

export default function AgendaMonthGrid({ cells, month, days, events, onOpenDay }: Props) {
  const byDate = new Map(days.map((day) => [day.date, day]))
  const today = toDateInputValue(new Date())

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
        {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((date) => {
          const key = toDateInputValue(date)
          const inMonth = date.getMonth() === month
          const isToday = key === today
          const dayEvents = events.filter((event) => eventCoversDate(event, key))
          const blocks = visibleBlocks(byDate.get(key)?.blocks ?? [])
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpenDay(date)}
              className={`min-h-[78px] rounded-lg border p-1.5 text-left text-xs transition ${
                isToday
                  ? "border-blue-400 bg-blue-50 shadow-sm ring-1 ring-blue-200 hover:border-blue-500"
                  : inMonth
                    ? "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                    : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
              }`}
            >
              <span
                className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[13px] font-semibold tabular-nums ${
                  isToday ? "bg-blue-600 text-white" : inMonth ? "text-slate-800" : "text-slate-400"
                }`}
              >
                {date.getDate()}
              </span>
              {blocks.length > 0 && (
                <span className="mt-1 flex gap-0.5" title={blocks.map((block) => block.title).join(", ")}>
                  {blocks.slice(0, 4).map((block) => (
                    <span key={block.id} className="h-1 flex-1 rounded-full bg-slate-400" />
                  ))}
                </span>
              )}
              {dayEvents.slice(0, 2).map((event) => (
                <span
                  key={event.id}
                  className="mt-0.5 block truncate rounded px-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: event.color }}
                >
                  {event.title}
                </span>
              ))}
              {dayEvents.length > 2 && (
                <span className="text-[10px] font-medium text-slate-600">
                  +{dayEvents.length - 2}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
