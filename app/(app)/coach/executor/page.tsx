"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Loader2, RefreshCw, Save } from "lucide-react"
import type { PlanGenerationMeta } from "@/lib/coach-types"

type SubjectRow = {
  id: string
  name: string
  in_edital: boolean
  in_executor: boolean
  has_attempts: boolean
  subject_priority: number
  eligible: boolean
}

export default function CoachExecutorPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<SubjectRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [distributionMode, setDistributionMode] = useState<
    "fixed_per_subject" | "equal_split"
  >("fixed_per_subject")
  const [perRound, setPerRound] = useState(5)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastMeta, setLastMeta] = useState<PlanGenerationMeta | null>(null)

  const load = useCallback(
    (uid: string, syncEdital = false) => {
      setLoading(true)
      const q = syncEdital ? "&sync_edital=1" : ""
      return Promise.all([
        fetch(`/api/coach/executor-subjects?user_id=${uid}${q}`).then((r) =>
          r.json()
        ),
        fetch(`/api/coach/daily-plan?user_id=${uid}`).then((r) => r.json()),
      ])
        .then(([subData, planData]) => {
          const rows = (subData.items ?? []) as SubjectRow[]
          setItems(rows)
          setSelected(
            new Set(
              rows.filter((r) => r.in_executor).map((r) => r.id)
            )
          )
          if (subData.preferences) {
            setDistributionMode(
              subData.preferences.question_distribution_mode ??
                "fixed_per_subject"
            )
            setPerRound(
              Number(subData.preferences.questions_per_subject_round ?? 5)
            )
          }
          const meta = planData.plan?.generation_meta as
            | PlanGenerationMeta
            | undefined
          setLastMeta(meta ?? null)
        })
        .finally(() => setLoading(false))
    },
    []
  )

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

  function toggleSubject(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!userId) return
    setSaving(true)
    await fetch("/api/coach/executor-subjects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        executor_subject_ids: [...selected],
        question_distribution_mode: distributionMode,
        questions_per_subject_round: perRound,
      }),
    })
    setSaving(false)
  }

  async function syncEdital() {
    if (!userId) return
    await load(userId, true)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  const eligibleCount = items.filter(
    (i) => selected.has(i.id) && i.has_attempts
  ).length

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href="/coach"
        className="inline-flex items-center gap-1 text-sm text-violet-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Coach
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-slate-900">Executor</h1>
        <p className="mt-1 text-sm text-slate-600">
          Define quais matérias entram no plano de Hoje, como distribuir questões
          erradas e veja como o último plano foi montado.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Matérias do plano
          </h2>
          <button
            type="button"
            onClick={syncEdital}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3 w-3" />
            Sincronizar com edital
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Marcadas = entram no executor. Só recebem questões as que já têm pelo
          menos 1 tentativa ({eligibleCount} elegíveis agora).
        </p>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {items.map((row) => (
            <li
              key={row.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                row.has_attempts ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-75"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => toggleSubject(row.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="flex-1 text-sm font-medium text-slate-900">
                {row.name}
              </span>
              {row.in_edital && (
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
                  Edital
                </span>
              )}
              {!row.has_attempts && (
                <span className="text-[10px] text-amber-700">Sem tentativas</span>
              )}
              {row.subject_priority > 0 && (
                <span className="text-[10px] text-slate-500">
                  prio {row.subject_priority.toFixed(2)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Distribuição de questões (rodízio)
        </h2>
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="dist"
              checked={distributionMode === "fixed_per_subject"}
              onChange={() => setDistributionMode("fixed_per_subject")}
            />
            Fixo por matéria (padrão)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="dist"
              checked={distributionMode === "equal_split"}
              onChange={() => setDistributionMode("equal_split")}
            />
            Dividir limite igualmente entre matérias no ciclo
          </label>
          {distributionMode === "fixed_per_subject" && (
            <div>
              <label className="text-xs text-slate-600">
                Questões por matéria por rodada
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={perRound}
                onChange={(e) => setPerRound(Number(e.target.value) || 5)}
                className="mt-1 w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Com rotação ligada em Configurações: 5 (ou o valor acima) questões
          erradas de cada matéria por rodada, até o limite diário. Sem rotação:
          top da fila cruzada.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar executor
        </button>
        <Link
          href="/coach/hoje"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ir para Plano de hoje
        </Link>
        <Link
          href="/coach/configuracoes"
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          Limites e rotação →
        </Link>
      </div>

      {lastMeta && (
        <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
          <h2 className="text-sm font-semibold text-violet-900">
            Último plano gerado (hoje)
          </h2>
          <p className="mt-1 text-xs text-violet-800">
            {lastMeta.total_questions} questões ·{" "}
            {lastMeta.question_mode === "round_robin"
              ? "rodízio"
              : "top fila"}
          </p>
          {lastMeta.rounds.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-violet-100 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-2 py-1">Rod.</th>
                    <th className="px-2 py-1">Matéria</th>
                    <th className="px-2 py-1">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {lastMeta.rounds.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1">{r.round}</td>
                      <td className="px-2 py-1">{r.subject_name}</td>
                      <td className="px-2 py-1">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
