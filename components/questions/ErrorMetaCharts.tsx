"use client"

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import type { LabelCount } from "@/lib/question-statistics-analysis"

const COLORS = [
  "#0d9488",
  "#2563eb",
  "#dc2626",
  "#ca8a04",
  "#7c3aed",
  "#db2777",
  "#059669",
  "#64748b",
]

type Props = {
  taxonomy: LabelCount[]
  outcomes: LabelCount[]
}

export default function ErrorMetaCharts({ taxonomy, outcomes }: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">
          Tipos de erro
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Taxonomia pedagógica nas tentativas erradas classificadas.
        </p>
        {taxonomy.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Ainda não há erros com taxonomia classificada.
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={taxonomy}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {taxonomy.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, _n, item) => {
                    const label =
                      (item?.payload as LabelCount | undefined)?.label ?? ""
                    return [v ?? 0, label]
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-600">
              {taxonomy.map((t, i) => (
                <li key={t.key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  {t.label} ({t.count})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">
          Metacognição (outcome)
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Combinação confiança × acerto nas tentativas.
        </p>
        {outcomes.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Sem outcomes registrados.
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={outcomes}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip formatter={(v) => [v ?? 0, "Tentativas"]} />
                <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
