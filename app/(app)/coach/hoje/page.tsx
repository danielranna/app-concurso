"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { DailyStudyBlock, DailyStudyPlan } from "@/lib/coach-types"
import { Loader2, RefreshCw, Play, BookOpen, Layers, AlertCircle } from "lucide-react"

function blockHref(block: DailyStudyBlock): string | null {
  if (block.type === "flashcards") return "/flashcards/study"
  if (block.type === "error_review" && block.params.subject_id) {
    return `/erros?subject_id=${block.params.subject_id}`
  }
  if (block.type === "questions" && block.params.question_ids) {
    return "/coach/inbox"
  }
  return null
}

export default function CoachHojePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [plan, setPlan] = useState<DailyStudyPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = useCallback((uid: string) => {
    setLoading(true)
    fetch(`/api/coach/daily-plan?user_id=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.plan) {
          setPlan({
            id: d.plan.id,
            date: d.plan.plan_date,
            mode: d.plan.mode,
            limits: d.plan.limits,
            blocks: d.plan.blocks ?? [],
            rotation_note: d.plan.rotation_note,
            narrative_summary: d.plan.narrative_summary,
          })
        } else setPlan(null)
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

  async function generate() {
    if (!userId) return
    setGenerating(true)
    try {
      const res = await fetch("/api/coach/daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, force: true }),
      })
      const data = await res.json()
      if (data.plan) setPlan(data.plan)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plano de hoje</h1>
          <p className="mt-1 text-sm text-slate-600">
            Agente de execução — blocos prontos com base na fila estratégica.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {plan ? "Regenerar plano" : "Gerar plano do dia"}
        </button>
      </header>

      {!plan && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
          <p>Nenhum plano para hoje. Clique em gerar para montar sua rotina.</p>
        </div>
      )}

      {plan && (
        <>
          {plan.narrative_summary && (
            <p className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-900">
              {plan.narrative_summary}
            </p>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>Modo: {plan.mode.replace("_", " ")}</span>
            <span>Questões: até {plan.limits.questions}</span>
            <span>Flashcards: até {plan.limits.flashcards}</span>
            {plan.rotation_note && <span>{plan.rotation_note}</span>}
          </div>

          <div className="grid gap-3">
            {plan.blocks.map((block, i) => {
              const href = blockHref(block)
              const Icon =
                block.type === "flashcards"
                  ? Layers
                  : block.type === "error_review"
                    ? AlertCircle
                    : BookOpen

              return (
                <div
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 text-violet-600" />
                    <div>
                      <p className="font-medium text-slate-900">{block.label}</p>
                      {block.subject_name && (
                        <p className="text-xs text-slate-500">{block.subject_name}</p>
                      )}
                      <p className="text-xs text-slate-400">
                        ~{block.minutes} min · {block.count} itens
                      </p>
                    </div>
                  </div>
                  {href ? (
                    <Link
                      href={href}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Play className="h-4 w-4" />
                      Iniciar
                    </Link>
                  ) : (
                    <Link
                      href="/coach/inbox"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Ver ações
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
