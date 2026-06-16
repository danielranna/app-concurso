"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BookOpen, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type NotebookRow = {
  id: string
  name: string
  subject_id: string | null
  question_count?: number
  answered_count?: number
}

type Props = {
  open: boolean
  userId: string
  subjectId: string
  subjectName?: string
  currentNotebookId?: string | null
  currentNotebookName?: string | null
  onClose: () => void
  onSelect: (notebook: { id: string; name: string } | null) => void
}

export default function NotebookPickerModal({
  open,
  userId,
  subjectId,
  subjectName,
  currentNotebookId,
  currentNotebookName,
  onClose,
  onSelect,
}: Props) {
  const [notebooks, setNotebooks] = useState<NotebookRow[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ user_id: userId })
      if (subjectId) params.set("subject_id", subjectId)
      const res = await fetch(`/api/notebooks?${params}`)
      const data = await res.json()
      setNotebooks(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [userId, subjectId])

  useEffect(() => {
    if (open) {
      setQuery("")
      load()
    }
  }, [open, load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notebooks
    return notebooks.filter((n) => n.name.toLowerCase().includes(q))
  }, [notebooks, query])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(32rem,90vh)] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Associar caderno
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {subjectName
                ? `Cadernos de ${subjectName}`
                : "Selecione um caderno de Questões"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar caderno…"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-slate-500">
              {notebooks.length === 0 ? (
                <>
                  Nenhum caderno nesta matéria.{" "}
                  <Link href="/questoes" className="text-teal-700 underline">
                    Criar em Questões
                  </Link>
                </>
              ) : (
                "Nenhum caderno encontrado com esse nome."
              )}
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((nb) => {
                const selected = nb.id === currentNotebookId
                return (
                  <li key={nb.id}>
                    <button
                      type="button"
                      onClick={() => onSelect({ id: nb.id, name: nb.name })}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? "bg-teal-50 ring-1 ring-teal-200"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <BookOpen
                        className={`h-4 w-4 shrink-0 ${
                          selected ? "text-teal-600" : "text-slate-400"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {nb.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {nb.answered_count ?? 0}/{nb.question_count ?? 0}{" "}
                          respondidas
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          {currentNotebookId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelect(null)}
            >
              Remover associação
            </Button>
          ) : (
            <span className="text-xs text-slate-400">Opcional</span>
          )}
          <div className="flex items-center gap-2">
            {currentNotebookName && (
              <span className="max-w-[10rem] truncate text-xs text-slate-500">
                Atual: {currentNotebookName}
              </span>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
