"use client"

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import type { TrendBucket } from "@/lib/question-statistics-analysis"

type Props = {
  trend: TrendBucket[]
}

function formatBucket(bucket: string): string {
  // YYYY-MM-DD → DD/MM
  const parts = bucket.split("-")
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`
  return bucket
}

export default function StatsTrendChart({ trend }: Props) {
  if (!trend.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        Sem dados temporais no período filtrado.
      </p>
    )
  }

  const data = trend.map((t) => ({
    ...t,
    label: formatBucket(t.bucket),
  }))

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis
            yAxisId="count"
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            width={36}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            width={36}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            formatter={(value, name) => {
              if (name === "correct_pct") return [`${value ?? 0}%`, "% acerto"]
              if (name === "correct") return [value ?? 0, "Acertos"]
              if (name === "wrong") return [value ?? 0, "Erros"]
              return [value ?? 0, String(name)]
            }}
            labelFormatter={(l) => `Período: ${l}`}
          />
          <Legend
            formatter={(value) => {
              if (value === "correct") return "Acertos"
              if (value === "wrong") return "Erros"
              if (value === "correct_pct") return "% acerto"
              return value
            }}
          />
          <Area
            yAxisId="count"
            type="monotone"
            dataKey="correct"
            stackId="1"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.35}
          />
          <Area
            yAxisId="count"
            type="monotone"
            dataKey="wrong"
            stackId="1"
            stroke="#ef4444"
            fill="#ef4444"
            fillOpacity={0.35}
          />
          <Area
            yAxisId="pct"
            type="monotone"
            dataKey="correct_pct"
            stroke="#0d9488"
            fill="transparent"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
