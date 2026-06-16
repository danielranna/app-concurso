"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Archive,
  Copy,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
} from "lucide-react"
import type { CyclePlanSummary } from "@/lib/study-cycle-plans"
import { cycleStatusLabel } from "@/lib/study-cycle-types"
import { withCycleId } from "@/lib/cycle-plan-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Props = {
  userId: string
  plans: CyclePlanSummary[]
  selectedCycleId: string | null
  activeCycleId: string | null
  loading?: boolean
  onRefresh: () => void
  onSelect: (cycleId: string) => void
}

export default function CyclePlansLibrary({
  userId,
  plans,
  selectedCycleId,
  activeCycleId,
  loading,
  onRefresh,
  onSelect,
}: Props) {
  const router = useRouter()
  const [acting, setActing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function createPlan() {
    const name = prompt("Nome do novo plano:", "Parte 02")
    if (!name?.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/ciclo/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action: "create", name }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? "Erro")
        return
      }
      onSelect(data.cycle_id)
      onRefresh()
    } finally {
      setCreating(false)
    }
  }

  async function duplicatePlan(planId: string, currentName: string) {
    const name = prompt("Nome da cópia:", `${currentName} (cópia)`)
    if (!name?.trim()) return
    setActing(planId)
    try {
      const res = await fetch("/api/ciclo/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "duplicate",
          duplicate_from_id: planId,
          name,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? "Erro")
        return
      }
      onSelect(data.cycle_id)
      onRefresh()
    } finally {
      setActing(null)
    }
  }

  async function planAction(
    planId: string,
    action: "activate" | "pause" | "archive" | "rename"
  ) {
    if (action === "rename") {
      const plan = plans.find((p) => p.id === planId)
      const name = prompt("Nome do plano:", plan?.name ?? "")
      if (!name?.trim()) return
      setActing(planId)
      try {
        const res = await fetch("/api/ciclo/plans", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            cycle_id: planId,
            action: "rename",
            name,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          alert(data.error ?? "Erro")
        } else onRefresh()
      } finally {
        setActing(null)
      }
      return
    }

    setActing(planId)
    try {
      const res = await fetch("/api/ciclo/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, cycle_id: planId, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? "Erro")
        return
      }
      if (action === "activate") onSelect(planId)
      onRefresh()
    } finally {
      setActing(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Meus planos</CardTitle>
          <CardDescription>
            Crie variantes por parte da consultoria ou duplique para editar sem
            perder o original.
          </CardDescription>
        </div>
        <Button type="button" size="sm" disabled={creating} onClick={createPlan}>
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Novo
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        )}
        {!loading && plans.length === 0 && (
          <p className="text-sm text-slate-500">
            Nenhum plano ainda. Crie um para começar.
          </p>
        )}
        {plans.map((plan) => {
          const selected = plan.id === selectedCycleId
          const isActive = plan.id === activeCycleId
          const busy = acting === plan.id
          return (
            <div
              key={plan.id}
              className={cn(
                "rounded-xl border p-3 transition-colors",
                selected
                  ? "border-teal-300 bg-teal-50/40"
                  : "border-slate-200 bg-white"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(plan.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-semibold text-slate-900">{plan.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge
                      variant={
                        plan.status === "active"
                          ? "success"
                          : plan.status === "completed"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {cycleStatusLabel(plan.status)}
                    </Badge>
                    {isActive && (
                      <Badge variant="default">Na fila da Início</Badge>
                    )}
                    <Badge variant="outline">
                      {plan.subject_count} matérias
                    </Badge>
                    {plan.has_schedule && (
                      <Badge variant="outline">{plan.progress_pct}% feito</Badge>
                    )}
                  </div>
                </button>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    title="Renomear"
                    onClick={() => planAction(plan.id, "rename")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    title="Duplicar"
                    onClick={() => duplicatePlan(plan.id, plan.name)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  {plan.status !== "active" && plan.status !== "completed" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      title="Ativar"
                      onClick={() => planAction(plan.id, "activate")}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                  {plan.status === "active" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      title="Pausar"
                      onClick={() => planAction(plan.id, "pause")}
                    >
                      <Pause className="h-4 w-4" />
                    </Button>
                  )}
                  {plan.status !== "completed" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      title="Arquivar"
                      onClick={() => {
                        if (confirm(`Arquivar "${plan.name}"?`)) {
                          planAction(plan.id, "archive")
                        }
                      }}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={withCycleId("/ciclo/materias", plan.id)}
                  className="text-xs text-teal-700 hover:underline"
                >
                  Matérias
                </Link>
                <Link
                  href={withCycleId("/ciclo/blocos", plan.id)}
                  className="text-xs text-teal-700 hover:underline"
                >
                  Blocos
                </Link>
                <Link
                  href={withCycleId("/ciclo/planejar", plan.id)}
                  className="text-xs text-teal-700 hover:underline"
                >
                  Planejar
                </Link>
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:underline"
                  onClick={() => {
                    onSelect(plan.id)
                    router.push(withCycleId("/ciclo", plan.id))
                  }}
                >
                  Ver detalhes
                </button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
