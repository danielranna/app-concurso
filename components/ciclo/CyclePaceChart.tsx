"use client"

import { useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import type { PaceAnalytics } from "@/lib/study-cycle-queue"

type Props = {
  pace: PaceAnalytics | null
}

export default function CyclePaceChart({ pace }: Props) {
  const [period, setPeriod] = useState<"week" | "month">("week")

  if (!pace || (!pace.weekly.length && !pace.monthly.length)) {
    return null
  }

  const data = period === "week" ? pace.weekly : pace.monthly

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Ritmo de estudo
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Esperado: {pace.blocks_per_day_label} · ~{pace.sessions_per_week_capacity}{" "}
            sessões/semana
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setPeriod("week")}
            className={`rounded px-2 py-1 ${period === "week" ? "bg-slate-100 font-medium" : ""}`}
          >
            Semanal
          </button>
          <button
            type="button"
            onClick={() => setPeriod("month")}
            className={`rounded px-2 py-1 ${period === "month" ? "bg-slate-100 font-medium" : ""}`}
          >
            Mensal
          </button>
        </div>
      </div>

      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="expected"
              name="Esperado (cumul.)"
              stroke="#94a3b8"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="Real (cumul.)"
              stroke="#0d9488"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
