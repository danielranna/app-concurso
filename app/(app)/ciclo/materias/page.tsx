"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import type { StudyCycleSubject } from "@/lib/study-cycle-types"
import { useCyclePlanId } from "@/lib/use-cycle-plan-id"
import { withCycleId } from "@/lib/cycle-plan-context"

type Subject = { id: string; name: string }

const WEIGHT_OPTIONS = [1, 2, 3, 4, 5]

export default function CicloMateriasPage() {
  const router = useRouter()
  const { cycleId: urlCycleId, setCycleId: setUrlCycleId } = useCyclePlanId()
  const [userId, setUserId] = useState<string | null>(null)
  const [allSubjects, setAllSubjects] = useState<Subject[]>([])
  const [selected, setSelected] = useState<Map<string, number>>(new Map())
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async (uid: string, cid?: string | null) => {
    setLoading(true)
    try {
      const q = cid ? `&cycle_id=${encodeURIComponent(cid)}` : ""
      const [subList, ciclo] = await Promise.all([
        fetch(`/api/subjects?user_id=${uid}`).then((r) => r.json()),
        fetch(`/api/ciclo?user_id=${uid}${q}`).then((r) => r.json()),
      ])
      setAllSubjects(Array.isArray(subList) ? subList : [])
      const cycle = ciclo.cycle
      if (cycle?.id) {
        setCycleId(cycle.id)
        setUrlCycleId(cycle.id)
      }
      const map = new Map<string, number>()
      for (const s of (cycle?.subjects ?? []) as StudyCycleSubject[]) {
        map.set(s.subject_id, s.weight ?? s.times_in_cycle ?? 1)
      }
      setSelected(map)
    } finally {
      setLoading(false)
    }
  }, [setUrlCycleId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      load(user.id, urlCycleId)
    })
  }, [router, load, urlCycleId])

  useEffect(() => {
    if (userId && urlCycleId) load(userId, urlCycleId)
  }, [userId, urlCycleId, load])

  function toggleSubject(id: string) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, 1)
      return next
    })
    setSaved(false)
  }

  function setWeight(id: string, weight: number) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.set(id, weight)
      return next
    })
    setSaved(false)
  }

  async function save() {
    if (!userId) return
    setSaving(true)
    setSaved(false)
    try {
      const subjects = [...selected.entries()].map(([subject_id, weight], i) => ({
        subject_id,
        sort_order: i,
        weight,
      }))
      const res = await fetch("/api/ciclo/content-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "save_subjects",
          cycle_id: cycleId,
          subjects,
        }),
      })
      const data = await res.json()
      if (data.error) alert(data.error)
      else {
        setCycleId(data.cycle_id)
        setSaved(true)
      }
    } finally {
      setSaving(false)
    }
  }

  const weightDistribution = WEIGHT_OPTIONS.map((w) => ({
    weight: w,
    count: [...selected.values()].filter((v) => v === w).length,
  })).filter((x) => x.count > 0)

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
        <h1 className="text-2xl font-bold text-slate-900">Matérias do ciclo</h1>
        <p className="mt-1 text-sm text-slate-600">
          Escolha as matérias e defina o peso. Peso 2 = aparece 2× por mini-ciclo.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-medium text-teal-800">
          {selected.size} matérias
        </span>
        {weightDistribution.map((w) => (
          <span
            key={w.weight}
            className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-800"
          >
            Peso {w.weight}: {w.count}
          </span>
        ))}
      </div>

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {allSubjects.map((s) => {
          const inCycle = selected.has(s.id)
          const weight = selected.get(s.id) ?? 1
          return (
            <li
              key={s.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                inCycle ? "bg-teal-50/30" : ""
              }`}
            >
              <label className="flex flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={inCycle}
                  onChange={() => toggleSubject(s.id)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                <span className="font-medium text-slate-900">{s.name}</span>
              </label>
              {inCycle && (
                <select
                  value={weight}
                  onChange={(e) => setWeight(s.id, Number(e.target.value))}
                  className="rounded border border-slate-200 px-2 py-1 text-sm"
                  title="Peso no mini-ciclo"
                >
                  {WEIGHT_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      Peso {w}
                    </option>
                  ))}
                </select>
              )}
            </li>
          )
        })}
      </ul>

      {allSubjects.length === 0 && (
        <p className="text-sm text-slate-500">
          Nenhuma matéria cadastrada. Crie matérias no mapa de erros primeiro.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving || selected.size === 0}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar matérias
        </button>
        {saved && (
          <span className="text-sm text-teal-600">Salvo!</span>
        )}
        {saved && (
          <Link
            href={withCycleId("/ciclo/blocos", cycleId)}
            className="text-sm text-teal-700 underline"
          >
            Próximo: montar blocos →
          </Link>
        )}
      </div>
    </div>
  )
}
