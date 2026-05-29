"use client"

import { useCallback, useEffect, useState } from "react"
import { Eye, EyeOff, Loader2, Send, Trash2 } from "lucide-react"

type NoteEntry = {
  id: string
  body: string
  created_at: string
  has_ai_response: boolean
}

type Props = {
  questionId: string
  userId: string
  layout?: "default" | "sidebar"
}

export default function QuickNote({ questionId, userId, layout = "default" }: Props) {
  const sidebar = layout === "sidebar"
  const [entries, setEntries] = useState<NoteEntry[]>([])
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [justSentIds, setJustSentIds] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/questions/${questionId}/notes?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.entries ?? [])
        setJustSentIds(new Set())
        setExpandedIds(new Set())
      })
      .finally(() => setLoading(false))
  }, [questionId, userId])

  useEffect(() => {
    setDraft("")
    setError(null)
    load()
  }, [load])

  const send = useCallback(async () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setError("Escreva algo antes de enviar")
      return
    }
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/questions/${questionId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, body: trimmed }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar")
      return
    }
    const entry = data.entry as NoteEntry
    setEntries((prev) => [...prev, entry])
    setDraft("")
    setJustSentIds((prev) => new Set(prev).add(entry.id))
    setExpandedIds((prev) => new Set(prev).add(entry.id))
  }, [draft, questionId, userId])

  async function removeEntry(entryId: string) {
    const ok = window.confirm(
      "Apagar esta anotação? Essa ação não pode ser desfeita."
    )
    if (!ok) return

    setDeletingId(entryId)
    setError(null)
    const res = await fetch(
      `/api/questions/${questionId}/notes/${entryId}?user_id=${userId}`,
      { method: "DELETE" }
    )
    const data = await res.json()
    setDeletingId(null)
    if (!res.ok) {
      setError(data.error ?? "Erro ao apagar")
      return
    }
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.delete(entryId)
      return next
    })
    setJustSentIds((prev) => {
      const next = new Set(prev)
      next.delete(entryId)
      return next
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      void send()
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function isExpanded(entry: NoteEntry) {
    return justSentIds.has(entry.id) || expandedIds.has(entry.id)
  }

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50 p-3 ${sidebar ? "flex h-full min-h-[280px] flex-col lg:min-h-[420px]" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500">Notas rápidas</p>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Carregando…</p>
      ) : entries.length > 0 ? (
        <ul className={`space-y-2 ${sidebar ? "max-h-48 overflow-y-auto lg:max-h-64" : ""}`}>
          {entries.map((entry) => {
            const expanded = isExpanded(entry)
            const isNew = justSentIds.has(entry.id)
            const busy = deletingId === entry.id
            return (
              <li
                key={entry.id}
                className={`rounded-md border px-2 py-1.5 text-sm ${
                  isNew
                    ? "border-violet-200 bg-violet-50/80"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-slate-500">
                    Anotação ·{" "}
                    {new Date(entry.created_at).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {!expanded && !isNew && (
                      <span className="text-slate-400"> · oculta</span>
                    )}
                  </p>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(entry.id)}
                      disabled={busy}
                      className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                      title={expanded ? "Ocultar texto" : "Ver anotação"}
                      aria-label={expanded ? "Ocultar anotação" : "Ver anotação"}
                    >
                      {expanded ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeEntry(entry.id)}
                      disabled={busy || deletingId !== null}
                      className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      title="Apagar anotação"
                      aria-label="Apagar anotação"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                {expanded && (
                  <p className="mt-1 whitespace-pre-wrap text-slate-800">
                    {entry.body}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}

      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setError(null)
        }}
        onKeyDown={handleKeyDown}
        rows={sidebar ? 6 : 3}
        placeholder="Dúvida, conceito a revisar..."
        className={`mt-2 w-full resize-y rounded border border-slate-200 bg-white px-2 py-1 text-sm ${sidebar ? "min-h-[100px] flex-1 lg:min-h-[140px]" : ""}`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={saving || !draft.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Enviar
        </button>
        <span className="text-xs text-slate-400">Ctrl+Enter</span>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
