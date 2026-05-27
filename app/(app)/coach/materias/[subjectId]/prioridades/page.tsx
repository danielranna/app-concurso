"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"
import PriorityRankingPanel from "@/components/coach/PriorityRankingPanel"
import type { PriorityBreakdown } from "@/lib/ai/priority-breakdown"

export default function CoachPrioridadesPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [breakdown, setBreakdown] = useState<PriorityBreakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)
  const [mobileTab, setMobileTab] = useState<"edital" | "brain" | "crossed">(
    "edital"
  )

  const loadBreakdown = useCallback(
    (uid: string) => {
      setLoading(true)
      return fetch(
        `/api/coach/priorities-breakdown?user_id=${uid}&subject_id=${subjectId}`
      )
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            console.error(data.error)
            return
          }
          setBreakdown(data as PriorityBreakdown)
        })
        .finally(() => setLoading(false))
    },
    [subjectId]
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      loadBreakdown(user.id)
    })
  }, [subjectId, router, loadBreakdown])

  async function handleRecompute() {
    if (!userId) return
    setRecomputing(true)
    try {
      const res = await fetch("/api/coach/priorities-breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, subject_id: subjectId }),
      })
      const data = await res.json()
      if (data.error) alert(data.error)
      else setBreakdown(data as PriorityBreakdown)
    } finally {
      setRecomputing(false)
    }
  }

  const subjectName = breakdown?.subject_name ?? "Matéria"

  return (
    <div className="space-y-6">
      <Link
        href={`/coach/materias/${subjectId}/insights`}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos insights
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Prioridades — {subjectName}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Três visões didáticas: o que cai na prova (edital + incidência), onde
            você está fraco (cérebro, só com questões feitas) e o resultado cruzado
            — que alimenta a fila estratégica no insights.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRecompute}
          disabled={recomputing || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {recomputing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Recalcular e salvar fila
        </button>
      </div>

      {/* Mobile tabs */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 lg:hidden">
        {(
          [
            ["edital", "Edital + Incidência"],
            ["brain", "Cérebro"],
            ["crossed", "Cruzado"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMobileTab(key)}
            className={`flex-1 rounded-md px-2 py-2 text-xs font-medium ${
              mobileTab === key
                ? "bg-white text-violet-900 shadow-sm"
                : "text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        <div
          className={
            mobileTab === "edital" ? "block lg:block" : "hidden lg:block"
          }
        >
          <PriorityRankingPanel
            title="1. Edital + Incidência"
            subtitle="O que mais cai na prova, independente do seu desempenho."
            items={breakdown?.edital_incidence ?? []}
            loading={loading}
            variant="edital"
            collapseAfter={15}
          />
        </div>
        <div
          className={
            mobileTab === "brain" ? "block lg:block" : "hidden lg:block"
          }
        >
          <PriorityRankingPanel
            title="2. Cérebro (desempenho)"
            subtitle="Só tópicos com questões resolvidas. Domínio baixo e status crítico sobem."
            items={breakdown?.brain_performance ?? []}
            loading={loading}
            variant="brain"
            collapseAfter={15}
          />
        </div>
        <div
          className={
            mobileTab === "crossed" ? "block lg:block" : "hidden lg:block"
          }
        >
          <PriorityRankingPanel
            title="3. Cruzado (resultado)"
            subtitle="Edital × incidência × urgência do cérebro. É o que vai para a fila estratégica."
            items={breakdown?.crossed ?? []}
            loading={loading}
            variant="crossed"
            highlighted
            collapseAfter={15}
          />
        </div>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-900">
          Ainda não estudado (alta incidência)
        </h3>
        <p className="mt-1 text-xs text-amber-900/80">
          Estes tópicos aparecem no ranking do edital, mas ainda não entram no
          cruzado nem no top 5 da fila até você resolver pelo menos uma questão.
        </p>
        <div className="mt-3">
          <PriorityRankingPanel
            title=""
            items={breakdown?.unattempted_high_incidence ?? []}
            loading={loading}
            variant="unattempted"
            collapseAfter={10}
            bare
          />
        </div>
      </section>
    </div>
  )
}
