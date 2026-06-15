"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Loader2, Play, Sparkles } from "lucide-react"
import type { CycleStats } from "@/lib/study-cycle-deadline-planner"
import type { StudyCycle, WeekdayLimits } from "@/lib/study-cycle-types"
import { defaultWeekdayLimits } from "@/lib/study-cycle-planner"
import CycleStatsPanel from "@/components/ciclo/CycleStatsPanel"
import CycleSetupIssuesModal from "@/components/ciclo/CycleSetupIssuesModal"
import type { CycleSetupIssue } from "@/lib/study-cycle-setup-validation"

type PlanningMode = "time_driven" | "deadline_driven"

export default function CicloPlanejarPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [cycle, setCycle] = useState<StudyCycle | null>(null)
  const [mode, setMode] = useState<PlanningMode>("deadline_driven")
  const [targetWeeks, setTargetWeeks] = useState(8)
  const [blockMinutes, setBlockMinutes] = useState(45)
  const [subjectsPerDay, setSubjectsPerDay] = useState(2)
  const [weekdayLimits, setWeekdayLimits] = useState<WeekdayLimits[]>(
    defaultWeekdayLimits()
  )
  const [stats, setStats] = useState<CycleStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [setupIssues, setSetupIssues] = useState<CycleSetupIssue[]>([])
  const [showSetupModal, setShowSetupModal] = useState(false)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    try {
      const ciclo = await fetch(`/api/ciclo?user_id=${uid}`).then((r) =>
        r.json()
      )
      const c: StudyCycle | null = ciclo.cycle ?? null
      setCycle(c)
      if (c?.planning_mode) setMode(c.planning_mode)
      if (c?.target_weeks) setTargetWeeks(c.target_weeks)
      if (c?.default_block_minutes) setBlockMinutes(c.default_block_minutes)
      if (c?.weekday_limits?.length) setWeekdayLimits(c.weekday_limits)
      if (c?.subjects_per_day) setSubjectsPerDay(c.subjects_per_day)
    } finally {
      setLoading(false)
    }
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

  const fetchPreview = useCallback(async () => {
    if (!userId || mode !== "deadline_driven") return
    setPreviewing(true)
    try {
      const ciclo = await fetch(`/api/ciclo?user_id=${userId}`).then((r) => r.json())
      const freshLimits = ciclo.cycle?.weekday_limits
      if (freshLimits?.length) setWeekdayLimits(freshLimits)

      const res = await fetch("/api/ciclo/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "preview",
          target_weeks: targetWeeks,
          default_block_minutes: blockMinutes,
        }),
      })
      const data = await res.json()
      if (data.setup_issues?.length) {
        setSetupIssues(data.setup_issues)
        setStats(null)
      } else {
        setSetupIssues([])
        if (data.stats) setStats(data.stats)
        else setStats(null)
      }
    } finally {
      setPreviewing(false)
    }
  }, [userId, mode, targetWeeks, blockMinutes])

  useEffect(() => {
    if (!loading && userId && mode === "deadline_driven") {
      const t = setTimeout(fetchPreview, 400)
      return () => clearTimeout(t)
    }
  }, [loading, userId, mode, fetchPreview])

  async function generate(activate: boolean) {
    if (!userId) return
    setGenerating(true)
    try {
      const res = await fetch("/api/ciclo/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: activate ? "generate_and_activate" : "generate",
          target_weeks: targetWeeks,
          default_block_minutes: blockMinutes,
          planning_mode: mode,
          subjects_per_day: subjectsPerDay,
        }),
      })
      const data = await res.json()
      if (data.error) {
        if (data.setup_issues?.length) {
          setSetupIssues(data.setup_issues)
          setShowSetupModal(true)
        } else {
          alert(data.error)
        }
        if (data.stats) setStats(data.stats)
      } else {
        router.push("/ciclo/semana")
      }
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
  }

  const setupOk =
    (cycle?.subjects?.length ?? 0) > 0 &&
    (cycle?.content_blocks?.length ?? 0) > 0

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
          Escolha como montar seu cronograma de estudos.
        </p>
      </div>

      {!setupOk && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Complete o setup:{" "}
          <Link href="/ciclo/materias" className="underline">
            Matérias
          </Link>{" "}
          →{" "}
          <Link href="/ciclo/blocos" className="underline">
            Blocos
          </Link>
        </div>
      )}

      {setupIssues.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            {setupIssues.length} pendência{setupIssues.length !== 1 ? "s" : ""} em
            Blocos — resolva antes de gerar.
          </span>
          <button
            type="button"
            onClick={() => setShowSetupModal(true)}
            className="font-medium text-teal-800 underline hover:text-teal-950"
          >
            Ver lista
          </button>
        </div>
      )}

      <div className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
        <ModeTab
          active={mode === "time_driven"}
          onClick={() => setMode("time_driven")}
          label="Tempo livre"
          hint="Você define minutos e matérias/dia"
        />
        <ModeTab
          active={mode === "deadline_driven"}
          onClick={() => setMode("deadline_driven")}
          label="Completar em X meses"
          hint="App calcula o ritmo necessário"
        />
      </div>

      {mode === "deadline_driven" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-700">
              Prazo (semanas)
              <input
                type="number"
                min={1}
                max={52}
                value={targetWeeks}
                onChange={(e) => setTargetWeeks(Number(e.target.value))}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2"
              />
              <span className="text-xs text-slate-400">
                ≈ {Math.round(targetWeeks / 4.33)} meses
              </span>
            </label>
            <label className="text-sm text-slate-700">
              Minutos por bloco
              <input
                type="number"
                min={15}
                step={15}
                value={blockMinutes}
                onChange={(e) => setBlockMinutes(Number(e.target.value))}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
          </div>

          <p className="text-xs text-slate-500">
            Dias e minutos da semana vêm de{" "}
            <Link href="/ciclo/configuracoes" className="text-teal-700 underline">
              Configurações
            </Link>
            .
          </p>

          <CycleStatsPanel stats={stats} loading={previewing} />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={generating || !setupOk}
              onClick={() => generate(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Gerar calendário
            </button>
            <button
              type="button"
              disabled={generating || !setupOk || stats?.feasible === false}
              onClick={() => generate(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Gerar e ativar
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <label className="block text-sm text-slate-700">
            Matérias por dia (referência)
            <input
              type="number"
              min={1}
              max={6}
              value={subjectsPerDay}
              onChange={(e) => setSubjectsPerDay(Number(e.target.value))}
              className="mt-1 block w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <p className="text-sm text-slate-600">
            No modo tempo livre, use o gerador por prazo com semanas longas ou
            monte manualmente em{" "}
            <Link href="/ciclo/semana" className="text-teal-700 underline">
              Semana
            </Link>{" "}
            após gerar um rascunho no modo prazo.
          </p>
          <button
            type="button"
            disabled={generating || !setupOk}
            onClick={() => {
              setMode("deadline_driven")
              setTargetWeeks(12)
            }}
            className="text-sm text-teal-700 underline"
          >
            Usar modo prazo para gerar automaticamente →
          </button>
        </div>
      )}
      {showSetupModal && setupIssues.length > 0 && (
        <CycleSetupIssuesModal
          issues={setupIssues}
          onClose={() => setShowSetupModal(false)}
        />
      )}
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-white font-medium text-teal-900 shadow-sm"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
      <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
        {hint}
      </span>
    </button>
  )
}
