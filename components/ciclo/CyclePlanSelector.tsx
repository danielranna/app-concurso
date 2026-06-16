"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import type { CyclePlanSummary } from "@/lib/study-cycle-plans"
import { cycleStatusLabel } from "@/lib/study-cycle-types"
import { withCycleId } from "@/lib/cycle-plan-context"
import { useCyclePlanId } from "@/lib/use-cycle-plan-id"

type Props = {
  userId: string
  plans?: CyclePlanSummary[]
}

export default function CyclePlanSelector({ userId, plans: plansProp }: Props) {
  const router = useRouter()
  const { cycleId, setCycleId } = useCyclePlanId()
  const [plans, setPlans] = useState<CyclePlanSummary[]>(plansProp ?? [])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (plansProp) setPlans(plansProp)
  }, [plansProp])

  useEffect(() => {
    if (plansProp?.length || !userId) return
    fetch(`/api/ciclo/plans?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []))
  }, [userId, plansProp])

  const current = plans.find((p) => p.id === cycleId) ?? plans[0]

  useEffect(() => {
    if (!cycleId && plans[0]?.id) setCycleId(plans[0].id, { replaceUrl: true })
  }, [cycleId, plans, setCycleId])

  if (!plans.length) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-slate-50"
      >
        <span className="min-w-0 truncate font-medium text-slate-900">
          {current?.name ?? "Plano"}
        </span>
        <span className="shrink-0 text-xs text-slate-500">
          {current ? cycleStatusLabel(current.status) : ""}
        </span>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {plans.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    p.id === cycleId ? "bg-teal-50" : ""
                  }`}
                  onClick={() => {
                    setCycleId(p.id)
                    setOpen(false)
                    router.replace(withCycleId(window.location.pathname, p.id))
                  }}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-slate-500">
                    {cycleStatusLabel(p.status)} · {p.subject_count} matérias
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
