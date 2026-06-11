"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Loader2, Sparkles, Save, Play } from "lucide-react"
import type { CyclePlannerResult, WeekdayLimits } from "@/lib/study-cycle-types"
import { defaultWeekdayLimits, WEEKDAY_LABELS } from "@/lib/study-cycle-planner"
import PrioritySourceBanner from "@/components/ciclo/PrioritySourceBanner"
import type { PrioritySource } from "@/lib/priority-source"

type Subject = { id: string; name: string }

export default function CicloPlanejarPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [subjectsPerDay, setSubjectsPerDay] = useState(2)
  const [weekdayLimits, setWeekdayLimits] = useState<WeekdayLimits[]>(
    defaultWeekdayLimits()
  )
  const [plan, setPlan] = useState<CyclePlannerResult | null>(null)
  const [prioritySource, setPrioritySource] = useState<PrioritySource>("brain")
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadSubjects = useCallback(async (uid: string) => {
    const [subRes, cicloRes] = await Promise.all([
      fetch(`/api/subjects?user_id=${uid}`).then((r) => r.json()),
      fetch(`/api/ciclo?user_id=${uid}`).then((r) => r.json()),
    ])
    setSubjects(Array.isArray(subRes) ? subRes : [])
    setPrioritySource(cicloRes.priority_source ?? "brain")

    const defaultIds: string[] = cicloRes.default_subject_ids ?? []
    const cycle = cicloRes.cycle
    if (cycle?.subjects?.length) {
      setSelected(new Set(cycle.subjects.map((s: { subject_id: string }) => s.subject_id)))
      setSubjectsPerDay(cycle.subjects_per_day ?? 2)
      if (cycle.weekday_limits?.length) {
        setWeekdayLimits(cycle.weekday_limits)
      }
    } else if (defaultIds.length) {
      setSelected(new Set(defaultIds))
    } else if (Array.isArray(subRes) && subRes.length) {
      setSelected(new Set(subRes.map((s: Subject) => s.id)))
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      loadSubjects(user.id).finally(() => setLoading(false))
    })
  }, [router, loadSubjects])

  const selectedList = useMemo(() => [...selected], [selected])

  function toggleSubject(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    setPlan(null)
  }

  function updateWeekday(weekday: number, patch: Partial<WeekdayLimits>) {
    setWeekdayLimits((prev) =>
      prev.map((w) => (w.weekday === weekday ? { ...w, ...patch } : w))
    )
    setPlan(null)
  }

  async function handlePreview() {
    if (!userId || selectedList.length === 0) {
      alert("Selecione ao menos uma matéria")
      return
    }
    setPreviewing(true)
    try {
      const res = await fetch("/api/ciclo/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "preview",
          subject_ids: selectedList,
          subjects_per_day: subjectsPerDay,
          weekday_limits: weekdayLimits,
        }),
      })
      const data = await res.json()
      if (data.error) alert(data.error)
      else setPlan(data.plan)
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSave(activate: boolean) {
    if (!userId || !plan?.days?.length) {
      alert("Gere a sugestão antes de salvar")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/ciclo/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: activate ? "save_and_activate" : "save",
          subject_ids: selectedList,
          subjects_per_day: subjectsPerDay,
          weekday_limits: weekdayLimits,
          plan,
          subjects_doubled: plan.subjects_doubled,
          name: "Meu ciclo",
        }),
      })
      const data = await res.json()
      if (data.error) alert(data.error)
      else router.push("/ciclo")
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
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/ciclo"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Planejar ciclo</h1>
        <p className="mt-1 text-sm text-slate-600">
          Selecione matérias e horas por dia. O app sugere a grade — você confirma
          ou ajusta.
        </p>
      </div>

      <PrioritySourceBanner source={prioritySource} studyMode="pre_edital" />

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Matérias no ciclo</h2>
        <p className="mt-1 text-xs text-slate-500">
          {selected.size} selecionada(s) · {subjects.length} no total
        </p>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-100">
          {subjects.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-center gap-3 border-b border-slate-50 px-3 py-2 last:border-0 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggleSubject(s.id)}
                className="rounded border-slate-300 text-teal-600"
              />
              <span className="text-sm text-slate-800">{s.name}</span>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-600">
            Matérias por dia do ciclo
          </label>
          <select
            value={subjectsPerDay}
            onChange={(e) => {
              setSubjectsPerDay(Number(e.target.value))
              setPlan(null)
            }}
            className="mt-1 block w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value={1}>1 matéria</option>
            <option value={2}>2 matérias</option>
            <option value={3}>3 matérias</option>
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Horas por dia da semana
        </h2>
        <div className="mt-3 space-y-2">
          {weekdayLimits.map((w) => (
            <div
              key={w.weekday}
              className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2"
            >
              <label className="flex w-24 items-center gap-2 text-sm">
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
                className="w-20 rounded border border-slate-200 px-2 py-1 text-sm disabled:opacity-40"
              />
              <span className="text-xs text-slate-500">min</span>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={handlePreview}
        disabled={previewing || selected.size === 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-3 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50 sm:w-auto"
      >
        {previewing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Gerar sugestão de ciclo
      </button>

      {plan && plan.days.length > 0 && (
        <section className="rounded-xl border border-teal-200 bg-teal-50/30 p-4">
          <h2 className="text-sm font-semibold text-teal-900">
            Sugestão — {plan.total_days} dias de ciclo
          </h2>
          {plan.subjects_doubled.length > 0 && (
            <p className="mt-1 text-xs text-teal-800/80">
              Matérias mais fracas aparecem 2×:{" "}
              {plan.subjects_doubled.length} matéria(s)
            </p>
          )}
          <ul className="mt-4 divide-y divide-teal-100 rounded-lg border border-teal-100 bg-white">
            {plan.days.map((day) => (
              <li
                key={day.day_index}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="font-medium text-slate-700">
                  Dia {day.day_index + 1} · {WEEKDAY_LABELS[day.weekday]}
                </span>
                <span className="text-slate-900">
                  {day.subject_names.join(" · ")}
                </span>
                <span className="text-xs text-slate-500">
                  ~{day.estimated_minutes} min · {day.daily_limits.questions} questões
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar rascunho
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Salvar e ativar ciclo
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
