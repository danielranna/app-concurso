"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import type { StudyCycle, WeekdayLimits } from "@/lib/study-cycle-types"
import { defaultWeekdayLimits, WEEKDAY_LABELS, scaleLimitsForMinutes, DEFAULT_MAX_BLOCKS } from "@/lib/study-cycle-planner"
import PrioritySourceBanner from "@/components/ciclo/PrioritySourceBanner"
import type { PrioritySource } from "@/lib/priority-source"

export default function CicloConfiguracoesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [cycle, setCycle] = useState<StudyCycle | null>(null)
  const [subjectsPerDay, setSubjectsPerDay] = useState(2)
  const [weekdayLimits, setWeekdayLimits] = useState<WeekdayLimits[]>(
    defaultWeekdayLimits()
  )
  const [prioritySource, setPrioritySource] = useState<PrioritySource>("brain")
  const [studyMode, setStudyMode] = useState("pre_edital")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback((uid: string) => {
    setLoading(true)
    return Promise.all([
      fetch(`/api/ciclo?user_id=${uid}`).then((r) => r.json()),
      fetch(`/api/coach/preferences?user_id=${uid}`).then((r) => r.json()),
    ])
      .then(([ciclo, prefs]) => {
        setCycle(ciclo.cycle ?? null)
        setPrioritySource(ciclo.priority_source ?? "brain")
        setSubjectsPerDay(
          ciclo.preferences?.subjects_per_cycle_day ??
            prefs.study?.subjects_per_cycle_day ??
            2
        )
        setStudyMode(prefs.study?.study_mode ?? "pre_edital")
        if (ciclo.cycle?.weekday_limits?.length) {
          setWeekdayLimits(ciclo.cycle.weekday_limits)
        }
      })
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

  function updateWeekday(
    weekday: number,
    patch: Partial<Pick<WeekdayLimits, "minutes" | "active" | "max_blocks">>
  ) {
    setWeekdayLimits((prev) =>
      prev.map((w) => {
        if (w.weekday !== weekday) return w
        const active = patch.active ?? w.active
        const minutes =
          patch.minutes != null
            ? patch.minutes
            : active
              ? Math.max(w.minutes, 60)
              : 0
        const limits = scaleLimitsForMinutes(
          defaultWeekdayLimits().find((d) => d.weekday === weekday)!
            .daily_limits,
          active ? minutes : 0
        )
        const max_blocks =
          patch.max_blocks !== undefined
            ? patch.max_blocks
            : w.max_blocks ?? (active ? DEFAULT_MAX_BLOCKS : null)
        return {
          ...w,
          minutes: active ? minutes : 0,
          active,
          max_blocks: active ? max_blocks : null,
          daily_limits: limits,
        }
      })
    )
    setSaved(false)
  }

  async function save() {
    if (!userId) return
    setSaving(true)
    setSaved(false)
    try {
      await fetch("/api/coach/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          study: { subjects_per_cycle_day: subjectsPerDay },
        }),
      })
      if (cycle?.id) {
        const res = await fetch("/api/ciclo/plan", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            cycle_id: cycle.id,
            weekday_limits: weekdayLimits,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          alert(
            data.error ??
              "Erro ao salvar limites por dia. Verifique as migrations no Supabase."
          )
          return
        }
      }
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/ciclo"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações do ciclo</h1>
        <p className="mt-1 text-sm text-slate-600">
          Volume de estudo por dia da semana. O modo pré/pós-edital está em{" "}
          <Link href="/coach/configuracoes" className="text-teal-700 underline">
            Coach → Configurações
          </Link>
          .
        </p>
      </div>

      <PrioritySourceBanner source={prioritySource} studyMode={studyMode} />

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-medium text-slate-900">
          Referência: matérias por dia (opcional)
        </label>
        <p className="mt-1 text-xs text-slate-500">
          No planejamento manual você define quantas matérias quiser por dia.
        </p>
        <input
          type="number"
          min={1}
          value={subjectsPerDay}
          onChange={(e) => {
            setSubjectsPerDay(Number(e.target.value))
            setSaved(false)
          }}
          className="mt-2 block w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Dias da semana</h2>
        <p className="mt-1 text-xs text-slate-500">
          Se um dia passar do máximo de blocos, o restante continua no próximo dia
          ativo (o ciclo pode ficar um pouco mais longo).
        </p>
        <div className="mt-3 space-y-2">
          {weekdayLimits.map((w) => (
            <div
              key={w.weekday}
              className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2"
            >
              <label className="flex w-28 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={w.active}
                  onChange={(e) =>
                    updateWeekday(w.weekday, {
                      active: e.target.checked,
                      minutes: e.target.checked ? Math.max(w.minutes, 60) : 0,
                    })
                  }
                  className="rounded border-slate-300 text-teal-600"
                />
                {WEEKDAY_LABELS[w.weekday]}
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <span>Min</span>
                <input
                  type="number"
                  min={0}
                  max={720}
                  step={30}
                  disabled={!w.active}
                  value={w.minutes}
                  onChange={(e) =>
                    updateWeekday(w.weekday, { minutes: Number(e.target.value) })
                  }
                  className="w-16 rounded border border-slate-200 px-2 py-1 text-sm disabled:opacity-40"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <span>Máx. blocos</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  disabled={!w.active}
                  value={w.max_blocks ?? DEFAULT_MAX_BLOCKS}
                  onChange={(e) =>
                    updateWeekday(w.weekday, {
                      max_blocks: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-14 rounded border border-slate-200 px-2 py-1 text-sm disabled:opacity-40"
                />
              </label>
              <span className="text-xs text-slate-500">
                → {w.daily_limits.questions} questões
              </span>
            </div>
          ))}
        </div>
      </section>

      {!cycle && (
        <p className="text-sm text-amber-800">
          Salve um ciclo em{" "}
          <Link href="/ciclo/planejar" className="underline">
            Planejar
          </Link>{" "}
          para persistir os limites por dia da semana no ciclo.
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Salvar
      </button>
      {saved && (
        <p className="text-sm text-teal-700">Configurações salvas.</p>
      )}
    </div>
  )
}
