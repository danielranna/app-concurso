"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Tooltip,
} from "recharts"
import { Loader2 } from "lucide-react"
import type { QuestionStatisticsResult } from "@/lib/question-statistics"
import { formatStudyDuration } from "@/lib/format-study-duration"

type Props = {
  userId: string
}

export default function HomeStatsSummary({ userId }: Props) {
  const [data, setData] = useState<QuestionStatisticsResult | null>(null)
  const [studyMs, setStudyMs] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [statsRes, hoursRes] = await Promise.all([
        fetch(`/api/questions/statistics?user_id=${userId}&period=all`),
        fetch(`/api/home/study-hours?user_id=${userId}`),
      ])
      const stats = await statsRes.json()
      const hours = await hoursRes.json()
      if (cancelled) return
      if (statsRes.ok) setData(stats)
      if (hoursRes.ok) setStudyMs(hours.total_ms ?? 0)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const radarData = useMemo(
    () =>
      (data?.by_subject ?? [])
        .filter((r) => r.total > 0)
        .map((r) => ({
          subject: r.short_label,
          pct: r.correct_pct,
          fullName: r.name,
        })),
    [data]
  )

  const pieData = useMemo(() => {
    if (!data?.summary.total_attempts) return []
    return [
      { name: "Acertos", value: data.summary.correct, color: "#22c55e" },
      { name: "Erros", value: data.summary.wrong, color: "#ef4444" },
    ]
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-12 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando estatísticas…
      </div>
    )
  }

  if (!data?.summary.total_attempts) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <p className="text-slate-600">Nenhuma questão respondida ainda.</p>
        <Link
          href="/questoes"
          className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          Ir para questões →
        </Link>
      </div>
    )
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Estatísticas</h2>
        <Link
          href="/questoes/estatisticas"
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          Ver detalhes
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <p className="text-xs text-slate-500">Questões resolvidas</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">
              {data.summary.total_attempts}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total de matérias</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">
              {data.summary.subject_count}
            </p>
          </div>
          <div>
            <p className="text-xs text-green-700">Acertos</p>
            <p className="text-2xl font-bold tabular-nums text-green-600">
              {data.summary.correct}
            </p>
          </div>
          <div>
            <p className="text-xs text-red-600">Erros</p>
            <p className="text-2xl font-bold tabular-nums text-red-600">
              {data.summary.wrong}
            </p>
          </div>
          <div className="col-span-2 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">Horas estudadas</p>
            <p className="text-xl font-bold tabular-nums text-indigo-700">
              {formatStudyDuration(studyMs)}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Soma dos cronômetros de cadernos e estudo da semana
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-medium text-slate-600">Taxa de acerto</p>
          <div className="relative h-44 w-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  innerRadius={52}
                  outerRadius={72}
                  startAngle={90}
                  endAngle={-270}
                >
                  {pieData.map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-slate-800">
                {data.summary.correct_pct}%
              </span>
            </div>
          </div>
        </div>

        <div className="min-h-[200px] rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-medium text-slate-600">Por matéria (% acerto)</p>
          {radarData.length >= 3 ? (
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <Radar
                  name="Acerto"
                  dataKey="pct"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.35}
                />
                <Tooltip
                  formatter={(v) => [`${v ?? 0}%`, "Acerto"]}
                  labelFormatter={(_, payload) =>
                    (payload?.[0]?.payload as { fullName?: string } | undefined)
                      ?.fullName ?? ""
                  }
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              Resolva questões em pelo menos 3 matérias para ver o radar.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
