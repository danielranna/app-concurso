"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { DailyStudyBlock, DailyStudyPlan } from "@/lib/coach-types"
import {
  Loader2,
  RefreshCw,
  Play,
  BookOpen,
  Layers,
  AlertCircle,
  Settings,
} from "lucide-react"

const MODE_LABELS: Record<string, string> = {
  pre_edital: "Pré-edital",
  pos_edital: "Pós-edital",
  reta_final: "Reta final",
}

function blockAction(
  block: DailyStudyBlock,
  combinedNotebookId: string | null | undefined
): { href: string; label: string } | null {
  if (block.type === "flashcards") {
    return { href: "/flashcards/study", label: "Iniciar flashcards" }
  }
  if (block.type === "error_review" && block.params.subject_id) {
    return {
      href: `/erros?subject_id=${block.params.subject_id}`,
      label: "Revisar erros",
    }
  }
  if (block.type === "questions") {
    const nbId =
      (block.params.notebook_id as string) || combinedNotebookId
    if (nbId) {
      return {
        href: `/questoes/cadernos/${nbId}`,
        label: "Abrir caderno",
      }
    }
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
          const blocks = (d.plan.blocks ?? []) as DailyStudyBlock[]
          setPlan({
            id: d.plan.id,
            date: d.plan.plan_date,
            mode: d.plan.mode,
            limits: d.plan.limits,
            blocks,
            rotation_note: d.plan.rotation_note,
            narrative_summary: d.plan.narrative_summary,
            combined_notebook_id: d.plan.combined_notebook_id ?? null,
            combined_question_count: blocks.find(
              (b) => b.params?.is_combined
            )?.count,
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
      if (data.error) alert(data.error)
      else if (data.plan) {
        const p = data.plan
        const blocks = (p.blocks ?? []) as DailyStudyBlock[]
        setPlan({
          id: p.id,
          date: p.plan_date ?? p.date,
          mode: p.mode,
          limits: p.limits,
          blocks,
          rotation_note: p.rotation_note,
          narrative_summary: p.narrative_summary,
          combined_notebook_id: p.combined_notebook_id ?? null,
          combined_question_count: blocks.find((b) => b.params?.is_combined)?.count,
        })
      }
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

  const combinedBlock = plan?.blocks.find((b) => b.params?.is_combined)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plano de hoje</h1>
          <p className="mt-1 text-sm text-slate-600">
            Questões reunidas em um caderno · limites em{" "}
            <Link
              href="/coach/configuracoes"
              className="font-medium text-violet-700 hover:underline"
            >
              Configurações
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/coach/configuracoes"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" />
            Limites e fase
          </Link>
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
        </div>
      </header>

      {!plan && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
          <p>Nenhum plano para hoje.</p>
          <p className="mt-2 text-sm">
            Defina modo e limites em Configurações, depois gere o plano.
          </p>
        </div>
      )}

      {plan && (
        <>
          {plan.narrative_summary && (
            <p className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-900">
              {plan.narrative_summary}
            </p>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium">
              {MODE_LABELS[plan.mode] ?? plan.mode}
            </span>
            <span>Até {plan.limits.questions} questões</span>
            <span>Até {plan.limits.flashcards} flashcards</span>
            {plan.rotation_note && (
              <span className="text-slate-500">{plan.rotation_note}</span>
            )}
          </div>

          {(plan.combined_notebook_id || combinedBlock) && (
            <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-violet-900">
                    Caderno único do dia
                  </p>
                  <p className="text-sm text-violet-800">
                    {plan.combined_question_count ??
                      combinedBlock?.count ??
                      0}{" "}
                    questões de várias matérias na ordem da fila estratégica
                  </p>
                </div>
                {plan.combined_notebook_id && (
                  <Link
                    href={`/questoes/cadernos/${plan.combined_notebook_id}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
                  >
                    <Play className="h-5 w-5" />
                    Estudar caderno agora
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-3">
            {plan.blocks
              .filter((b) => !b.params?.is_combined)
              .map((block, i) => {
                const action = blockAction(block, plan.combined_notebook_id)
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
                        <p className="font-medium text-slate-900">
                          {block.label}
                        </p>
                        {block.subject_name && (
                          <p className="text-xs text-slate-500">
                            {block.subject_name}
                          </p>
                        )}
                        <p className="text-xs text-slate-400">
                          ~{block.minutes} min · {block.count} itens
                        </p>
                      </div>
                    </div>
                    {action ? (
                      <Link
                        href={action.href}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Play className="h-4 w-4" />
                        {action.label}
                      </Link>
                    ) : null}
                  </div>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}
