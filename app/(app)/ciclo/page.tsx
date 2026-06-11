"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Loader2, Calendar, Settings, PenLine } from "lucide-react"
import type { StudyCycle } from "@/lib/study-cycle-types"
import type { PrioritySource } from "@/lib/priority-source"
import PrioritySourceBanner from "@/components/ciclo/PrioritySourceBanner"
import CycleToggle from "@/components/ciclo/CycleToggle"
import { WEEKDAY_LABELS } from "@/lib/study-cycle-planner"

type CicloOverview = {
  preferences: {
    cycle_enabled: boolean
    study_mode: string
    subjects_per_cycle_day: number
  }
  cycle: StudyCycle | null
  priority_source: PrioritySource
}

export default function CicloOverviewPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [data, setData] = useState<CicloOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const load = useCallback((uid: string) => {
    setLoading(true)
    return fetch(`/api/ciclo?user_id=${uid}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      load(user.id)
    })
  }, [router, load])

  async function handleToggle(action: "pause" | "resume") {
    if (!userId) return
    setToggling(true)
    try {
      const res = await fetch("/api/ciclo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error ?? "Erro")
        return
      }
      await load(userId)
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
  }

  const cycle = data?.cycle
  const prefs = data?.preferences

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ciclo de estudo</h1>
        <p className="mt-1 text-sm text-slate-600">
          Planeje um ciclo amplo para o pré-edital ou pause para seguir a
          consultoria.
        </p>
      </div>

      {data?.priority_source && prefs && (
        <PrioritySourceBanner
          source={data.priority_source}
          studyMode={prefs.study_mode}
        />
      )}

      <CycleToggle
        cycleEnabled={prefs?.cycle_enabled ?? false}
        hasCycle={Boolean(cycle?.days?.length)}
        loading={toggling}
        onPause={() => handleToggle("pause")}
        onResume={() => handleToggle("resume")}
      />

      {cycle && cycle.days.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Ciclo atual
          </h2>
          <p className="mt-2 text-lg font-medium text-slate-900">{cycle.name}</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Status</dt>
              <dd className="text-sm font-medium capitalize text-slate-800">
                {cycle.status === "active"
                  ? "Ativo"
                  : cycle.status === "paused"
                    ? "Pausado"
                    : cycle.status === "draft"
                      ? "Rascunho"
                      : cycle.status}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Dia do ciclo</dt>
              <dd className="text-sm font-medium text-slate-800">
                {cycle.current_day_index + 1} / {cycle.total_days}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Matérias</dt>
              <dd className="text-sm font-medium text-slate-800">
                {cycle.subjects.length}
              </dd>
            </div>
          </dl>

          {cycle.status === "active" && cycle.days[cycle.current_day_index] && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase text-slate-500">
                Hoje no ciclo
              </p>
              <p className="mt-1 text-sm text-slate-800">
                {(cycle.days[cycle.current_day_index].subject_ids ?? [])
                  .map(
                    (id) =>
                      cycle.subjects.find((s) => s.subject_id === id)
                        ?.subject_name ?? id
                  )
                  .join(" · ") || "—"}
              </p>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
          <p className="text-sm text-slate-600">
            Monte seu ciclo manualmente: organize o índice em Conteúdo, depois
            adicione dias e blocos em Planejar.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/ciclo/conteudo"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Conteúdo
            </Link>
            <Link
              href="/ciclo/planejar"
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              <PenLine className="h-4 w-4" />
              Planejar ciclo
            </Link>
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/ciclo/conteudo"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-200 hover:bg-teal-50/30"
        >
          <PenLine className="h-5 w-5 text-teal-600" />
          <div>
            <p className="text-sm font-medium text-slate-900">Conteúdo</p>
            <p className="text-xs text-slate-500">Índice e hierarquia</p>
          </div>
        </Link>
        <Link
          href="/ciclo/planejar"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-200 hover:bg-teal-50/30"
        >
          <PenLine className="h-5 w-5 text-teal-600" />
          <div>
            <p className="text-sm font-medium text-slate-900">Planejar</p>
            <p className="text-xs text-slate-500">Montar ou editar ciclo</p>
          </div>
        </Link>
        <Link
          href="/ciclo/semana"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-200 hover:bg-teal-50/30"
        >
          <Calendar className="h-5 w-5 text-teal-600" />
          <div>
            <p className="text-sm font-medium text-slate-900">Semana</p>
            <p className="text-xs text-slate-500">Ver grade do ciclo</p>
          </div>
        </Link>
        <Link
          href="/ciclo/configuracoes"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-200 hover:bg-teal-50/30"
        >
          <Settings className="h-5 w-5 text-teal-600" />
          <div>
            <p className="text-sm font-medium text-slate-900">Configurações</p>
            <p className="text-xs text-slate-500">Horas por dia da semana</p>
          </div>
        </Link>
      </div>

      {!prefs?.cycle_enabled && (
        <p className="text-center text-xs text-slate-500">
          Consultoria: monte o estudo semanal em{" "}
          <Link href="/questoes/semana" className="text-teal-700 underline">
            Questões → Semana
          </Link>
        </p>
      )}

      {cycle && cycle.days.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Próximos dias do ciclo
          </h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {cycle.days.slice(0, 5).map((day) => (
              <li
                key={day.day_index}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-slate-600">
                  Dia {day.day_index + 1}
                  {day.weekday != null && ` (${WEEKDAY_LABELS[day.weekday]})`}
                </span>
                <span className="font-medium text-slate-800">
                  {day.subject_ids
                    .map(
                      (id) =>
                        cycle.subjects.find((s) => s.subject_id === id)
                          ?.subject_name ?? "?"
                    )
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
          {cycle.days.length > 5 && (
            <Link
              href="/ciclo/semana"
              className="mt-2 block text-xs text-teal-700 hover:underline"
            >
              Ver ciclo completo ({cycle.total_days} dias)
            </Link>
          )}
        </section>
      )}
    </div>
  )
}
