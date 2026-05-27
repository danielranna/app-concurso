"use client"

import PerformanceStackBar from "@/components/questions/PerformanceStackBar"
import type { BrainDetailPayload } from "@/lib/ai/brain-detail"

type Props = {
  overview: BrainDetailPayload["overview"]
}

export default function BrainOverviewCards({ overview }: Props) {
  const cards = [
    {
      label: "Resoluções",
      value: overview.total_attempts,
      sub: null,
    },
    {
      label: "Acertos",
      value: overview.correct,
      className: "text-green-600",
    },
    {
      label: "Erros",
      value: overview.wrong,
      className: "text-red-600",
    },
    {
      label: "Tópicos fortes",
      value: overview.topics_strong,
      sub: "dominado / forte",
    },
    {
      label: "Tópicos fracos",
      value: overview.topics_weak,
      sub: "fraco / crítico / ilusão",
    },
    {
      label: "Sinais ativos",
      value: overview.signals_count,
      sub: null,
    },
    {
      label: "Relatórios",
      value: overview.reports_count,
      sub: "cadernos analisados",
    },
  ]

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
        Visão geral
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="text-xs text-slate-500">{c.label}</p>
            <p
              className={`text-2xl font-bold tabular-nums ${c.className ?? "text-slate-900"}`}
            >
              {c.value}
            </p>
            {c.sub && <p className="text-xs text-slate-400">{c.sub}</p>}
          </div>
        ))}
      </div>
      {overview.total_attempts > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-medium text-slate-600">
            Taxa global na matéria
          </p>
          <PerformanceStackBar
            correct={overview.correct}
            wrong={overview.wrong}
            showText
          />
        </div>
      )}
    </section>
  )
}
