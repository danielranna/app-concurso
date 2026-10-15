"use client"

import type { AgendaEvent } from "@/lib/agenda-types"
import { formatDayMonth, formatTimeShort, parseDateInput } from "@/lib/home-date"

type Props = {
  events: AgendaEvent[]
  onOpen: (event: AgendaEvent) => void
}

export default function AgendaUpcoming({ events, onOpen }: Props) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-sm font-medium text-slate-800">Próximos</p>
      {events.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Nenhum evento a partir de hoje.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {events.map((event) => {
            const when = formatDayMonth(parseDateInput(event.event_date.slice(0, 10)))
            const time = event.start_time ? formatTimeShort(event.start_time) : null
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onOpen(event)}
                  className="flex w-full items-start gap-2 rounded-lg bg-white px-2 py-1.5 text-left hover:bg-slate-100"
                >
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: event.color }}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {event.title}
                    </span>
                    <span className="text-xs text-slate-500">
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
    </aside>
  )
}
