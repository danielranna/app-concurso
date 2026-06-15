"use client"

import type { CycleStats } from "@/lib/study-cycle-deadline-planner"

type Props = {
  stats: CycleStats | null
  loading?: boolean
}

export default function CycleStatsPanel({ stats, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Calculando...
      </div>
    )
  }
  if (!stats) return null

  const pct =
    stats.minutes_total_available > 0
      ? Math.round(
          (stats.minutes_total_required / stats.minutes_total_available) * 100
        )
      : 0

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">Resumo do ciclo</h3>

      <p className="text-xs text-slate-500">
        Configuração da semana: {stats.weekday_minutes_label} ·{" "}
        {stats.active_days_per_week} dias ativos · ~{stats.minutes_per_week_available}{" "}
        min/semana
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sessões totais" value={String(stats.total_sessions)} />
        <StatCard
          label="Capacidade no prazo"
          value={String(stats.sessions_capacity_in_period)}
          hint={`${stats.total_sessions} necessárias · ~${Math.round(stats.minutes_total_available / 60)} h`}
        />
        <StatCard
          label="Por mini-ciclo"
          value={String(stats.mini_cycle_sessions)}
          hint={`${stats.mini_cycles_to_complete} mini-ciclos para completar`}
        />
        <StatCard
          label="Prazo sugerido"
          value={`${stats.suggested_weeks} sem`}
          hint={
            stats.feasible
              ? "Cabe no prazo atual"
              : `Sugestão: ~${stats.suggested_weeks} semanas (hoje: ${stats.target_weeks})`
          }
        />
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-600">
          <span>Uso do tempo no prazo</span>
          <span>
            {Math.round(stats.minutes_total_required / 60)} h /{" "}
            {Math.round(stats.minutes_total_available / 60)} h ({pct}%)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${
              stats.feasible ? "bg-teal-500" : "bg-red-500"
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        {stats.warning && (
          <p className="mt-2 text-sm text-red-600">{stats.warning}</p>
        )}
        {!stats.feasible && stats.suggested_weeks > 0 && (
          <p className="mt-1 text-xs text-slate-600">
            Média de ~{stats.sessions_per_day} sessões/dia ({stats.minutes_per_day_required}{" "}
            min) vs {stats.minutes_per_day_available} min/dia em média.
          </p>
        )}
      </div>

      {stats.per_subject.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="py-2 pr-2">Matéria</th>
                <th className="py-2 pr-2">Blocos</th>
                <th className="py-2 pr-2">Peso</th>
                <th className="py-2 pr-2">Sessões</th>
                <th className="py-2">/semana</th>
              </tr>
            </thead>
            <tbody>
              {stats.per_subject.map((s) => (
                <tr key={s.subject_id} className="border-b border-slate-50">
                  <td className="py-2 pr-2 font-medium">{s.subject_name ?? s.subject_id}</td>
                  <td className="py-2 pr-2">{s.block_count}</td>
                  <td className="py-2 pr-2">
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">
                      ×{s.weight}
                    </span>
                  </td>
                  <td className="py-2 pr-2">{s.total_sessions}</td>
                  <td className="py-2">{s.sessions_per_week_needed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  )
}
