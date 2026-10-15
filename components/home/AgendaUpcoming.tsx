"use client"

import type { AgendaMarker } from "@/lib/agenda-types"
import { formatDayMonth, formatTimeShort, parseDateInput } from "@/lib/home-date"

type Props = {
  events: AgendaMarker[]
  onOpen: (event: AgendaMarker) => void
}

export default function AgendaUpcoming({ events, onOpen }: Props) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
      <div className="flex items-center gap-3">
        <p className="shrink-0 text-sm font-medium text-slate-800">Próximos</p>
        {events.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhum evento a partir de hoje.</p>
        ) : (
          <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {events.map((event) => {
              const when = formatDayMonth(parseDateInput(event.event_date.slice(0, 10)))
              const time = event.start_time ? formatTimeShort(event.start_time) : null
              return (
                <li key={event.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpen(event)}
                    className="flex max-w-[220px] items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-left hover:bg-slate-100"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: event.color }}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {event.title}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {when}
                        {time ? ` · ${time}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
