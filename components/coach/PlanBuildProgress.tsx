"use client"

import { useEffect, useRef } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import type { PlanGenerationStep } from "@/lib/coach-types"

type Props = {
  steps: PlanGenerationStep[]
  active?: boolean
}

export function PlanBuildProgress({ steps, active = false }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [steps.length])

  if (!steps.length && !active) return null

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <p className="text-sm font-semibold text-violet-900">Montando o plano…</p>
      <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto text-xs text-violet-800">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1
          const spinning = active && isLast && step.phase !== "done"
          return (
            <li key={idx} className="flex items-start gap-2">
              {spinning ? (
                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-violet-600" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
              )}
              <span>{step.message}</span>
            </li>
          )
        })}
        {active && steps.length === 0 && (
          <li className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
            <span>Iniciando…</span>
          </li>
        )}
        <div ref={bottomRef} />
      </ul>
    </div>
  )
}
