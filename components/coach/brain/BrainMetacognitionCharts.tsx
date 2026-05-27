"use client"

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ERROR_TAXONOMY_LABELS,
  OUTCOME_CATEGORY_LABELS,
} from "@/lib/coach-labels"
import type { ErrorTaxonomy } from "@/lib/coach-types"

type Props = {
  outcomeDistribution: { key: string; count: number }[]
  errorTaxonomyDistribution: { key: string; count: number }[]
}

export default function BrainMetacognitionCharts({
  outcomeDistribution,
  errorTaxonomyDistribution,
}: Props) {
  const outcomeData = outcomeDistribution.map((o) => ({
    name:
      OUTCOME_CATEGORY_LABELS[o.key] ??
      o.key,
    count: o.count,
    key: o.key,
  }))

  const errorData = errorTaxonomyDistribution.map((e) => ({
    name:
      ERROR_TAXONOMY_LABELS[e.key as ErrorTaxonomy] ?? e.key,
    count: e.count,
  }))

  const OUTCOME_COLORS: Record<string, string> = {
    conhecimento_solido: "#22c55e",
    conhecimento_fragil: "#86efac",
    lacuna_critica: "#ef4444",
    lacuna_consciente: "#f97316",
    falso_positivo: "#a855f7",
    conteudo_desconhecido: "#64748b",
    unknown: "#cbd5e1",
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Metacognição (outcome)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Como você se classificou em cada tentativa (confiança × resultado).
        </p>
        {outcomeData.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">Sem tentativas ainda.</p>
        ) : (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outcomeData} layout="vertical" margin={{ left: 8 }}>
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {outcomeData.map((e) => (
                    <Cell
                      key={e.key}
                      fill={OUTCOME_COLORS[e.key] ?? "#94a3b8"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Perfil de erro (taxonomia)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Classificação dos erros após relatórios de caderno (quando disponível).
        </p>
        {errorData.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">
            Nenhum erro classificado ainda — conclua cadernos para gerar relatório.
          </p>
        ) : (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={errorData} layout="vertical" margin={{ left: 8 }}>
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  )
}
