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
  Pin,
  CheckCircle2,
  FileText,
} from "lucide-react"

const MODE_LABELS: Record<string, string> = {
  pre_edital: "Pré-edital",
  pos_edital: "Pós-edital",
  reta_final: "Reta final",
}

function blockKey(block: DailyStudyBlock): string {
  return (
    (block.params?.block_key as string) ??
    `${block.type}:${block.subject_id}:all`
  )
}

function blockAction(
  block: DailyStudyBlock,
  combinedNotebookId: string | null | undefined
): { href: string; label: string } | null {
  if (block.type === "flashcards") {
    const sid = block.subject_id
    return {
      href: sid
        ? `/flashcards/study?subject_id=${sid}`
        : "/flashcards/study",
      label: "Iniciar flashcards",
    }
  }
  if (block.type === "error_review" && block.params.subject_id) {
    const sid = block.params.subject_id as string
    const topic = block.params.topic_key as string | undefined
    const q = topic
      ? `?topic=${encodeURIComponent(topic)}`
      : ""
    return {
      href: `/coach/materias/${sid}/insights${q}`,
      label: "Revisar erros",
    }
  }
  if (block.type === "read_material" && block.params.subject_id) {
    return {
      href: `/coach/materias/${block.params.subject_id ?? block.subject_id}/insights`,
      label: "Ver material",
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

function parsePlanFromApi(p: Record<string, unknown>): DailyStudyPlan {
  const blocks = (p.blocks ?? []) as DailyStudyBlock[]
  return {
    id: p.id as string,
    date: (p.plan_date ?? p.date) as string,
    mode: p.mode as DailyStudyPlan["mode"],
    limits: p.limits as DailyStudyPlan["limits"],
    blocks,
    rotation_note: p.rotation_note as string | undefined,
    narrative_summary: p.narrative_summary as string | undefined,
    combined_notebook_id: (p.combined_notebook_id as string) ?? null,
    combined_question_count: blocks.find((b) => b.params?.is_combined)?.count,
    user_pinned: Boolean(p.user_pinned),
    completed_block_keys: (p.completed_block_keys as string[]) ?? [],
  }
}

export default function CoachHojePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [plan, setPlan] = useState<DailyStudyPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [pinning, setPinning] = useState(false)
  const [completingKey, setCompletingKey] = useState<string | null>(null)

  const load = useCallback((uid: string) => {
    setLoading(true)
    fetch(`/api/coach/daily-plan?user_id=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.plan) setPlan(parsePlanFromApi(d.plan))
        else setPlan(null)
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
        body: JSON.stringify({ user_id: userId, force: true, pin: false }),
      })
      const data = await res.json()
      if (data.error) alert(data.error)
      else if (data.plan) setPlan(parsePlanFromApi(data.plan))
    } finally {
      setGenerating(false)
    }
  }

  async function togglePin() {
    if (!userId || !plan?.id) return
    setPinning(true)
    try {
      const res = await fetch("/api/coach/daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          force: false,
          pin: !plan.user_pinned,
        }),
      })
      const data = await res.json()
      if (data.error) alert(data.error)
      else if (data.plan) setPlan(parsePlanFromApi(data.plan))
      else load(userId)
    } finally {
      setPinning(false)
    }
  }

  async function markComplete(block: DailyStudyBlock) {
    if (!userId || !plan?.id) return
    const key = blockKey(block)
    setCompletingKey(key)
    try {
      const res = await fetch("/api/coach/daily-plan/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          plan_id: plan.id,
          block_key: key,
        }),
      })
      const data = await res.json()
      if (data.error) alert(data.error)
      else {
        setPlan((prev) =>
          prev
            ? {
                ...prev,
                completed_block_keys: [
                  ...new Set([...(prev.completed_block_keys ?? []), key]),
                ],
              }
            : prev
        )
      }
    } finally {
      setCompletingKey(null)
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
  const completedSet = new Set(plan?.completed_block_keys ?? [])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plano de hoje</h1>
          <p className="mt-1 text-sm text-slate-600">
            Matérias ordenadas pela fila estratégica ·{" "}
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
          {plan && (
            <button
              type="button"
              onClick={togglePin}
              disabled={pinning}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60 ${
                plan.user_pinned
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Pin className="h-4 w-4" />
              {plan.user_pinned ? "Plano fixado" : "Fixar plano"}
            </button>
          )}
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
            {plan.user_pinned && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                Fixado — jobs não sobrescrevem
              </span>
            )}
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
                    questões na ordem da fila estratégica
                  </p>
                  {typeof combinedBlock?.params?.queue_reason === "string" && (
                    <p className="mt-1 text-xs text-violet-700">
                      {combinedBlock.params.queue_reason}
                    </p>
                  )}
                </div>
                {plan.combined_notebook_id && (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/questoes/cadernos/${plan.combined_notebook_id}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
                    >
                      <Play className="h-5 w-5" />
                      Estudar caderno agora
                    </Link>
                    <Link
                      href={`/questoes/cadernos/${plan.combined_notebook_id}?save=1`}
                      className="inline-flex items-center gap-2 rounded-lg border border-violet-400 bg-white px-4 py-2.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
                    >
                      Salvar na biblioteca
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-3">
            {plan.blocks
              .filter((b) => !b.params?.is_combined)
              .map((block, i) => {
                const action = blockAction(block, plan.combined_notebook_id)
                const key = blockKey(block)
                const done = completedSet.has(key)
                const Icon =
                  block.type === "flashcards"
                    ? Layers
                    : block.type === "error_review"
                      ? AlertCircle
                      : block.type === "read_material"
                        ? FileText
                        : BookOpen

                return (
                  <div
                    key={i}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
                      done
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 text-violet-600" />
                      <div>
                        <p className="font-medium text-slate-900">
                          {block.label}
                          {done && (
                            <span className="ml-2 text-xs font-normal text-emerald-700">
                              Concluído
                            </span>
                          )}
                        </p>
                        {block.subject_name && (
                          <p className="text-xs text-slate-500">
                            {block.subject_name}
                          </p>
                        )}
                        {typeof block.params?.queue_reason === "string" && (
                          <p className="mt-1 text-xs text-violet-700">
                            {block.params.queue_reason}
                          </p>
                        )}
                        {block.type === "read_material" &&
                          typeof block.params?.excerpt === "string" && (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                              {block.params.excerpt}
                            </p>
                          )}
                        <p className="text-xs text-slate-400">
                          ~{block.minutes} min · {block.count} itens
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!done && (
                        <button
                          type="button"
                          onClick={() => markComplete(block)}
                          disabled={completingKey === key}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                        >
                          {completingKey === key ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Marcar feito
                        </button>
                      )}
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
                  </div>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}
