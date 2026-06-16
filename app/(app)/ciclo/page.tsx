"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  Loader2,
  Calendar,
  Settings,
  PenLine,
  CheckCircle2,
  Circle,
  ArrowRight,
  BookOpen,
  Layers,
  LayoutGrid,
} from "lucide-react"
import type { StudyCycle } from "@/lib/study-cycle-types"
import type { PrioritySource } from "@/lib/priority-source"
import PrioritySourceBanner from "@/components/ciclo/PrioritySourceBanner"
import CycleToggle from "@/components/ciclo/CycleToggle"
import CyclePaceChart from "@/components/ciclo/CyclePaceChart"
import { WEEKDAY_LABELS } from "@/lib/study-cycle-planner"
import type { PaceAnalytics } from "@/lib/study-cycle-queue"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type CicloOverview = {
  preferences: {
    cycle_enabled: boolean
    study_mode: string
    subjects_per_cycle_day: number
  }
  cycle: StudyCycle | null
  priority_source: PrioritySource
}

const quickLinks = [
  {
    href: "/ciclo/materias",
    icon: BookOpen,
    title: "Matérias",
    desc: "Peso no mini-ciclo",
    accent: "from-violet-50 to-indigo-50 text-indigo-600",
  },
  {
    href: "/ciclo/blocos",
    icon: Layers,
    title: "Blocos",
    desc: "Agrupar assuntos",
    accent: "from-sky-50 to-blue-50 text-sky-600",
  },
  {
    href: "/ciclo/planejar",
    icon: PenLine,
    title: "Planejar",
    desc: "Gerar calendário",
    accent: "from-teal-50 to-emerald-50 text-teal-600",
  },
  {
    href: "/ciclo/semana",
    icon: Calendar,
    title: "Semana",
    desc: "Ver grade do ciclo",
    accent: "from-amber-50 to-orange-50 text-amber-600",
  },
  {
    href: "/ciclo/configuracoes",
    icon: Settings,
    title: "Configurações",
    desc: "Blocos por dia",
    accent: "from-slate-50 to-zinc-50 text-slate-600",
  },
]

export default function CicloOverviewPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [data, setData] = useState<CicloOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [pace, setPace] = useState<PaceAnalytics | null>(null)
  const [paceLoading, setPaceLoading] = useState(false)

  const load = useCallback((uid: string) => {
    setLoading(true)
    return fetch(`/api/ciclo?user_id=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        const hasBlocks = (d.cycle?.cycle_blocks?.length ?? 0) > 0
        if (hasBlocks) {
          setPaceLoading(true)
          return fetch(`/api/ciclo/queue?user_id=${uid}`)
            .then((r) => r.json())
            .then((qd) => {
              setPace(qd.pace ?? null)
              if (qd.cycle) {
                setData((prev) =>
                  prev ? { ...prev, cycle: qd.cycle } : prev
                )
              }
            })
            .finally(() => setPaceLoading(false))
        }
        setPace(null)
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

  const hasSubjects = (cycle?.subjects?.length ?? 0) > 0
  const hasBlocks = (cycle?.content_blocks?.length ?? 0) > 0
  const hasPlan = (cycle?.days?.length ?? 0) > 0
  const hasQueue = (cycle?.cycle_blocks?.length ?? 0) > 0
  const isActive = cycle?.status === "active" && prefs?.cycle_enabled

  const setupSteps = [
    { done: hasSubjects, label: "Matérias", href: "/ciclo/materias" },
    { done: hasBlocks, label: "Blocos", href: "/ciclo/blocos" },
    { done: hasPlan, label: "Calendário", href: "/ciclo/planejar" },
    { done: isActive, label: "Ativo", href: "/ciclo/semana" },
  ]

  const statusLabel =
    cycle?.status === "active"
      ? "Ativo"
      : cycle?.status === "paused"
        ? "Pausado"
        : cycle?.status === "draft"
          ? "Rascunho"
          : cycle?.status

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-teal-200/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
              <LayoutGrid className="h-4 w-4 text-teal-600" />
            </div>
            <Badge variant={isActive ? "success" : "outline"}>
              {isActive ? "Ciclo em execução" : "Visão geral"}
            </Badge>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            Ciclo de estudo
          </h1>
          <p className="mt-1 max-w-lg text-sm text-slate-600">
            Planeje um ciclo amplo para o pré-edital ou pause para seguir a
            consultoria.
          </p>
        </div>
      </div>

      {data?.priority_source && prefs && (
        <PrioritySourceBanner
          source={data.priority_source}
          studyMode={prefs.study_mode}
        />
      )}

      <CycleToggle
        cycleEnabled={prefs?.cycle_enabled ?? false}
        hasCycle={hasPlan}
        loading={toggling}
        onPause={() => handleToggle("pause")}
        onResume={() => handleToggle("resume")}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Setup do ciclo
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {setupSteps.map((step, i) => (
              <Link
                key={step.href}
                href={step.href}
                className={cn(
                  "group flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all",
                  step.done
                    ? "border-teal-200/80 bg-teal-50/50 text-teal-800 hover:bg-teal-50"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                )}
                <span className="font-medium">
                  {i + 1}. {step.label}
                </span>
                <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {cycle && cycle.days.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{cycle.name}</CardTitle>
            <CardDescription>Resumo do ciclo atual</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Status", value: statusLabel },
                {
                  label: "Dia do ciclo",
                  value: `${cycle.current_day_index + 1} / ${cycle.total_days}`,
                },
                {
                  label: "Modo",
                  value:
                    cycle.planning_mode === "deadline_driven"
                      ? `Prazo (${cycle.target_weeks ?? "?"} sem)`
                      : "Tempo livre",
                },
                { label: "Matérias", value: String(cycle.subjects.length) },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                >
                  <p className="text-xs font-medium text-slate-500">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 text-base font-semibold capitalize text-slate-900">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {cycle.status === "active" && !hasQueue && cycle.days[cycle.current_day_index] && (
              <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
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
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed bg-slate-50/30">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-slate-600">
              Configure matérias, monte blocos de assuntos e gere o calendário
              automaticamente.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link
                href="/ciclo/materias"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
              >
                1. Matérias
              </Link>
              <Link
                href="/ciclo/blocos"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
              >
                2. Blocos
              </Link>
              <Link
                href="/ciclo/planejar"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700"
              >
                <PenLine className="h-4 w-4" />
                3. Planejar
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {hasQueue && cycle && (
        <CyclePaceChart pace={paceLoading ? null : pace} />
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Atalhos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
                  link.accent
                )}
              >
                <link.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {link.title}
                </p>
                <p className="text-xs text-slate-500">{link.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </Link>
          ))}
        </div>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Próximos dias</CardTitle>
            <CardDescription>Primeiros dias do calendário gerado</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-slate-100">
              {cycle.days.slice(0, 5).map((day) => (
                <li
                  key={day.day_index}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    Dia {day.day_index + 1}
                    {day.weekday != null && ` · ${WEEKDAY_LABELS[day.weekday]}`}
                  </span>
                  <span className="truncate text-right font-medium text-slate-800">
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
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
              >
                Ver ciclo completo ({cycle.total_days} dias)
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
