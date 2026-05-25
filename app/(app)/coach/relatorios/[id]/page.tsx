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

  async function regenerate() {
    if (!userId) return
    setRegenerating(true)
    try {
      const res = await fetch(`/api/coach/reports/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      })
      const data = await res.json()
      if (!res.ok) alert(data.error ?? "Erro ao regenerar")
      else {
        const r = await fetch(`/api/coach/reports/${id}?user_id=${userId}`)
        const refreshed = await r.json()
        if (r.ok) setReport(refreshed)
      }
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={regenerate}
        disabled={regenerating}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {regenerating ? "Regenerando…" : "Regenerar relatório"}
      </button>
      <NotebookReportDetail report={report} backHref="/coach" />
    </div>
  )
}
