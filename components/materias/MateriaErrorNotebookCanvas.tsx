"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, RefreshCw } from "lucide-react"
import type { StoredNotebookDocument } from "@/lib/blocknote/types"
import StudyNotebookViewer from "@/components/blocknote/StudyNotebookViewer"

type Props = {
  userId: string
  subjectId: string
  subjectName: string
}

export default function MateriaErrorNotebookCanvas({
  userId,
  subjectId,
  subjectName,
}: Props) {
  const [document, setDocument] = useState<StoredNotebookDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [stale, setStale] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [reportCount, setReportCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(
      `/api/materias/${subjectId}/erros-ia?user_id=${userId}`
    )
    const data = await res.json()
    setDocument(data.document ?? null)
    setStale(Boolean(data.stale))
    setUpdatedAt(data.updated_at ?? null)
    setReportCount((data.source_report_ids ?? []).length)
    setLoading(false)
  }, [userId, subjectId])

  useEffect(() => {
    load()
  }, [load])

  async function handleUpdate() {
    setUpdating(true)
    await fetch(`/api/materias/${subjectId}/erros-ia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
    await load()
    setUpdating(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando caderno de erros…
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Caderno de erros</h2>
          <p className="text-sm text-slate-600">
            Síntese personalizada pela IA para {subjectName}.
            {reportCount > 0 && ` · ${reportCount} relatório(s) incorporado(s)`}
          </p>
          {updatedAt && (
            <p className="text-xs text-slate-400">
              Atualizado em {new Date(updatedAt).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {stale && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              Há relatórios novos
            </span>
          )}
          <button
            type="button"
            onClick={handleUpdate}
            disabled={updating}
            className="flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm text-white hover:bg-violet-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${updating ? "animate-spin" : ""}`} />
            Atualizar caderno
          </button>
          <Link
            href={`/coach/materias/${subjectId}/insights`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Ver insights
          </Link>
        </div>
      </div>

      {document ? (
        <StudyNotebookViewer key={updatedAt ?? "empty"} document={document} />
      ) : (
        <p className="text-slate-500">
          Conclua um caderno de questões com relatório IA para gerar seu caderno de erros.
        </p>
      )}
    </div>
  )
}
