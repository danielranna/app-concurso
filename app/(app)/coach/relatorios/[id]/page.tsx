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

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
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

  return (
    <NotebookReportDetail report={report} backHref="/coach" />
  )
}
