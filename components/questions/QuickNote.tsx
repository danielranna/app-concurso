"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Send } from "lucide-react"

type Props = {
  questionId: string
  userId: string
  layout?: "default" | "sidebar"
}

export default function QuickNote({ questionId, userId, layout = "default" }: Props) {
  const sidebar = layout === "sidebar"
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSaved(false)
    setError(null)
    fetch(`/api/questions/${questionId}/note?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => setNote(d.note ?? ""))
  }, [questionId, userId])

  const save = useCallback(async () => {
    const trimmed = note.trim()
    if (!trimmed) {
      setError("Escreva algo antes de enviar")
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await fetch(`/api/questions/${questionId}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, note: trimmed }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar")
      return
    }
    setNote(trimmed)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }, [note, questionId, userId])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      void save()
    }
  }

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50 p-3 ${sidebar ? "flex h-full min-h-[280px] flex-col lg:min-h-[420px]" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500">Nota rápida</p>
        {saved && <span className="text-xs text-green-600">Salva!</span>}
      </div>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value)
          setSaved(false)
          setError(null)
        }}
        onKeyDown={handleKeyDown}
        rows={sidebar ? 12 : 4}
        placeholder="Dúvida, conceito a revisar..."
        className={`w-full resize-y rounded border border-slate-200 bg-white px-2 py-1 text-sm ${sidebar ? "min-h-[200px] flex-1 lg:min-h-[320px]" : ""}`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !note.trim()}
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
