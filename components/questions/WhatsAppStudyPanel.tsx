"use client"

import { useEffect, useMemo, useState } from "react"
import { MessageCircle, Plus, X } from "lucide-react"

type Category = { id?: number; name: string }

type Props = {
  userId: string
  questionId: string
  notebookId?: string
  shortIdHint?: string | null
  forceEnabled?: boolean
  questionType: string
  options: { label: string; text: string }[]
  selected: string | null
  tags: string[]
  comment: string
  onTagsChange: (tags: string[]) => void
  onCommentChange: (comment: string) => void
}

function letterOf(type: string, selected: string | null) {
  if (!selected) return ""
  if (type === "certo_errado") {
    if (/^certo$/i.test(selected) || selected.toUpperCase() === "C") return "c"
    return "e"
  }
  return selected.trim().toLowerCase().slice(0, 1)
}

export default function WhatsAppStudyPanel({
  userId,
  questionId,
  notebookId,
  shortIdHint,
  forceEnabled,
  questionType,
  options,
  selected,
  tags,
  comment,
  onTagsChange,
  onCommentChange,
}: Props) {
  const [enabled, setEnabled] = useState(Boolean(forceEnabled))
  const [loading, setLoading] = useState(!forceEnabled)
  const [qty, setQty] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [shortId, setShortId] = useState(shortIdHint ?? "")
  const [newTag, setNewTag] = useState("")
  const [assistLetter, setAssistLetter] = useState("")
  const [assistBusy, setAssistBusy] = useState(false)
  const [assistMsg, setAssistMsg] = useState<string | null>(null)
  const [assistReveal, setAssistReveal] = useState<{
    letter: string
    isCorrect: boolean
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!forceEnabled) setLoading(true)
      try {
        let nextEnabled = Boolean(forceEnabled)
        if (notebookId) {
          const params = new URLSearchParams({ user_id: userId, question_id: questionId })
          const res = await fetch(`/api/notebooks/${notebookId}/quiz-sync?${params}`)
          const data = await res.json().catch(() => ({}))
          if (cancelled) return
          nextEnabled = Boolean(data.enabled) || Boolean(forceEnabled)
          setEnabled(nextEnabled)
          if (Number(data.assistEliminateQty)) setQty(Number(data.assistEliminateQty) || 0)
          if (Array.isArray(data.categories) && data.categories.length) {
            setCategories(data.categories)
          }
          if (data.short_id) setShortId(String(data.short_id))
          else if (shortIdHint) setShortId(shortIdHint)
          if (data.synced_comment && !comment) onCommentChange(String(data.synced_comment))
        } else {
          setEnabled(nextEnabled)
          if (shortIdHint) setShortId(shortIdHint)
        }

        if (nextEnabled) {
          const res = await fetch(`/api/quiz-sync/inventory?user_id=${encodeURIComponent(userId)}`)
          const data = await res.json().catch(() => ({}))
          if (cancelled) return
          setQty(Number(data.assistEliminateQty) || 0)
          setCategories(Array.isArray(data.categories) ? data.categories : [])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [notebookId, questionId, userId, forceEnabled, shortIdHint])

  const letters = useMemo(() => {
    if (questionType === "certo_errado") {
      return [
        { letter: "c", label: "Certo" },
        { letter: "e", label: "Errado" },
      ]
    }
    const fromOpts = options
      .map((o) => o.label.trim().toLowerCase().slice(0, 1))
      .filter(Boolean)
    const unique = [...new Set(fromOpts.length ? fromOpts : ["a", "b", "c", "d", "e"])]
    return unique.map((l) => ({ letter: l, label: l.toUpperCase() }))
  }, [options, questionType])

  if (!enabled && !forceEnabled) return null
  if (loading && !forceEnabled) return null

  function addTag(raw: string) {
    const name = raw.trim()
    if (!name) return
    if (tags.some((t) => t.toLowerCase() === name.toLowerCase())) return
    onTagsChange([...tags, name])
    setNewTag("")
  }

  async function verifyLetter(letter: string) {
    const sid = shortId || shortIdHint
    if (!sid || !letter) {
      setAssistMsg("Esta questão ainda não foi publicada no WhatsApp.")
      return
    }
    setAssistBusy(true)
    setAssistMsg(null)
    try {
      const res = await fetch("/api/quiz-sync/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, shortId: sid, letter }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAssistMsg(data.error || "Não foi possível verificar.")
        return
      }
      setQty(Number(data.assistEliminateQty) || Math.max(0, qty - 1))
      const reveal = data.assistReveal || {
        letter: String(letter).toUpperCase(),
        isCorrect: Boolean(data.isCorrect),
      }
      setAssistReveal({
        letter: String(reveal.letter || letter).toUpperCase(),
        isCorrect: Boolean(reveal.isCorrect),
      })
      setAssistMsg(
        reveal.isCorrect
          ? `${String(reveal.letter).toUpperCase()} é verdadeira.`
          : `${String(reveal.letter).toUpperCase()} é falsa.`
      )
    } catch (e) {
      setAssistMsg(e instanceof Error ? e.message : "Erro")
    } finally {
      setAssistBusy(false)
    }
  }

  const pick = assistLetter || letterOf(questionType, selected)

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-emerald-700" />
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
          Painel WhatsApp
        </p>
      </div>

      <p className="text-xs text-slate-600">
        {forceEnabled
          ? "Tags, comentário da resposta e verificação vão para o Papa Vagas. O double-click que risca alternativa continua local."
          : "Tags e verificação de alternativa valem só neste caderno sincronizado com o Papa Vagas. O double-click que risca alternativa continua grátis e local."}
      </p>

      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-slate-700">Tags (//cat)</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-xs text-slate-800"
            >
              {t}
              <button
                type="button"
                className="text-slate-400 hover:text-red-600"
                onClick={() => onTagsChange(tags.filter((x) => x !== t))}
                aria-label={`Remover ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addTag(newTag)
              }
            }}
            placeholder="Nova tag"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => addTag(newTag)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
        {categories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {categories.map((c) => (
              <button
                key={c.id ?? c.name}
                type="button"
                onClick={() => addTag(c.name)}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:border-emerald-300"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="mt-3 block text-xs font-medium text-slate-700">
        Anotação da resposta (sincronizada)
        <textarea
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
        />
      </label>

      <div className="mt-3 border-t border-emerald-100 pt-3">
        <p className="mb-2 text-xs font-medium text-slate-700">
          Verificar alternativa{" "}
          <span className="font-normal text-slate-500">({qty} no inventário)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {letters.map((l) => (
            <button
              key={l.letter}
              type="button"
              onClick={() => setAssistLetter(l.letter)}
              className={`rounded-lg border px-2.5 py-1 text-xs ${
                pick === l.letter
                  ? "border-emerald-700 bg-emerald-800 text-white"
                  : "border-slate-200 bg-white text-slate-800"
              }`}
            >
              {l.label}
            </button>
          ))}
          <button
            type="button"
            disabled={assistBusy || qty <= 0 || !pick}
            onClick={() => verifyLetter(pick)}
            className="rounded-lg bg-emerald-800 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {assistBusy ? "Verificando…" : "Verificar"}
          </button>
        </div>
        {assistReveal && (
          <p
            className={`mt-2 text-xs font-medium ${
              assistReveal.isCorrect ? "text-emerald-800" : "text-red-700"
            }`}
          >
            {assistReveal.letter}: {assistReveal.isCorrect ? "verdadeira" : "falsa"}
          </p>
        )}
        {assistMsg && <p className="mt-1 text-xs text-slate-600">{assistMsg}</p>}
      </div>
    </section>
  )
}
