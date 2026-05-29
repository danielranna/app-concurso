"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import NotebookReportDetail from "@/components/coach/NotebookReportDetail"
import type { NotebookReportStructured } from "@/lib/coach-types"

export default function CoachReportDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [report, setReport] = useState<{
    id: string
    notebook_id: string
    subject_id: string | null
    summary_md: string | null
    structured: NotebookReportStructured
    model_used: string | null
    created_at: string
    notebooks: {
      name: string
      question_count: number
      completed_at: string | null
    } | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [regeneratingAudit, setRegeneratingAudit] = useState(false)
  const [regenModalOpen, setRegenModalOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      const res = await fetch(
        `/api/coach/reports/${id}?user_id=${user.id}`
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Relatório não encontrado")
        return
      }
      setReport(data)
    })
  }, [id, router])

  if (error) {
    return (
      <p className="text-sm text-red-600">{error}</p>
    )
  }

  if (!report) {
    return <p className="text-sm text-slate-500">Carregando relatório…</p>
  }

  async function reloadReport() {
    if (!userId) return
    const r = await fetch(`/api/coach/reports/${id}?user_id=${userId}`)
    const refreshed = await r.json()
    if (r.ok) setReport(refreshed)
  }

  async function regenerate(reprocessNotes: boolean) {
    if (!userId) return
    setRegenModalOpen(false)
    setRegenerating(true)
    try {
      const res = await fetch(`/api/coach/reports/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, reprocess_notes: reprocessNotes }),
      })
      const data = await res.json()
      if (!res.ok) alert(data.error ?? "Erro ao regenerar")
      else await reloadReport()
    } finally {
      setRegenerating(false)
    }
  }

  async function regenerateAudit(reprocessNotes: boolean) {
    if (!userId) return
    setRegeneratingAudit(true)
    try {
      const res = await fetch(`/api/coach/reports/${id}/regenerate-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          reprocess_notes: reprocessNotes,
        }),
      })
      const data = await res.json()
      if (!res.ok) alert(data.error ?? "Erro ao regenerar auditoria")
      else if (data.structured) {
        setReport((prev) =>
          prev ? { ...prev, structured: data.structured } : prev
        )
      } else await reloadReport()
    } finally {
      setRegeneratingAudit(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setRegenModalOpen(true)}
        disabled={regenerating}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {regenerating ? "Regenerando…" : "Regenerar relatório"}
      </button>

      {regenModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="regen-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2
              id="regen-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              Regenerar relatório
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              As respostas da IA às suas anotações já processadas podem ser
              reutilizadas para economizar chamadas de API. O que você prefere?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void regenerate(false)}
                className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800"
              >
                Só anotações novas (recomendado)
              </button>
              <button
                type="button"
                onClick={() => void regenerate(true)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reprocessar todas as anotações
              </button>
              <button
                type="button"
                onClick={() => setRegenModalOpen(false)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <NotebookReportDetail
        report={report}
        backHref="/coach"
        onRegenerateAudit={() => {
          const all = window.confirm(
            "Regenerar auditoria:\n\nOK = reprocessar TODAS as anotações\nCancelar = só anotações novas"
          )
          void regenerateAudit(all)
        }}
        regeneratingAudit={regeneratingAudit}
      />
    </div>
  )
}
