"use client"

import { useEffect, useState } from "react"
import { ChevronDown, Loader2, Plus, Trash2, X } from "lucide-react"

type OptionRow = { label: string; text: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  userId: string
  questionId: string
  onSaved: () => void
}

const MCQ_LABELS = ["A", "B", "C", "D", "E"]

export default function EditQuestionModal({
  isOpen,
  onClose,
  userId,
  questionId,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<"before" | "after" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<"multiple_choice" | "certo_errado">("multiple_choice")
  const [statement, setStatement] = useState("")
  const [contentBefore, setContentBefore] = useState("")
  const [contentAfter, setContentAfter] = useState("")
  const [correctAnswer, setCorrectAnswer] = useState("")
  const [options, setOptions] = useState<OptionRow[]>([])
  const [showGabarito, setShowGabarito] = useState(false)

  useEffect(() => {
    if (!isOpen || !questionId) return
    setLoading(true)
    setError(null)
    setShowGabarito(false)
    fetch(`/api/questions/${questionId}?user_id=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error)
          return
        }
        const q = d.question
        const opts = (d.options ?? []).map((o: { label: string; text: string }) => ({
          label: o.label,
          text: o.text,
        }))
        setType(q.type === "certo_errado" ? "certo_errado" : "multiple_choice")
        setStatement(q.statement ?? "")
        setContentBefore(q.content_before ?? "")
        setContentAfter(q.content_after ?? "")
        setCorrectAnswer(q.correct_answer ?? "")
        if (opts.length) setOptions(opts)
        else if (q.type === "certo_errado") {
          setOptions([
            { label: "Certo", text: "Certo" },
            { label: "Errado", text: "Errado" },
          ])
        } else {
          setOptions(MCQ_LABELS.map((l) => ({ label: l, text: "" })))
        }
      })
      .finally(() => setLoading(false))
  }, [isOpen, questionId, userId])

  function handleTypeChange(next: "multiple_choice" | "certo_errado") {
    setType(next)
    if (next === "certo_errado") {
      setOptions([
        { label: "Certo", text: "Certo" },
        { label: "Errado", text: "Errado" },
      ])
      if (!["Certo", "Errado"].includes(correctAnswer)) setCorrectAnswer("Certo")
    } else {
      setOptions(MCQ_LABELS.map((l) => ({ label: l, text: "" })))
      setCorrectAnswer("A")
    }
  }

  async function uploadImage(slot: "before" | "after", file: File) {
    setUploading(slot)
    const form = new FormData()
    form.append("user_id", userId)
    form.append("file", file)
    const res = await fetch("/api/questions/upload", { method: "POST", body: form })
    const data = await res.json()
    setUploading(null)
    if (!res.ok) {
      setError(data.error ?? "Erro no upload")
      return
    }
    if (slot === "before") setContentBefore(data.url)
    else setContentAfter(data.url)
  }

  async function handleSave() {
    if (!statement.trim()) {
      setError("Enunciado obrigatório")
      return
    }
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/questions/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        type,
        statement: statement.trim(),
        content_before: contentBefore.trim() || null,
        content_after: contentAfter.trim() || null,
        correct_answer: correctAnswer.trim(),
        options: options
          .filter((o) => o.text.trim())
          .map((o, i) => ({ label: o.label, text: o.text.trim(), sort_order: i })),
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar")
      return
    }
    onSaved()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Editar questão</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Correção só para você — não altera o banco global de questões.
        </p>

        {loading ? (
          <p className="py-8 text-center text-slate-500">Carregando…</p>
        ) : (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <label className="block text-sm">
              <span className="font-medium">Tipo</span>
              <select
                value={type}
                onChange={(e) =>
                  handleTypeChange(e.target.value as "multiple_choice" | "certo_errado")
                }
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option value="multiple_choice">Múltipla escolha</option>
                <option value="certo_errado">Certo ou Errado</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium">Conteúdo acima do enunciado</span>
              <textarea
                value={contentBefore}
                onChange={(e) => setContentBefore(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Texto ou cole URL de imagem após upload"
              />
              <input
                type="file"
                accept="image/*"
                className="mt-1 text-xs"
                disabled={uploading === "before"}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadImage("before", f)
                }}
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">Enunciado</span>
              <textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                rows={6}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">Conteúdo abaixo do enunciado</span>
              <textarea
                value={contentAfter}
                onChange={(e) => setContentAfter(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                type="file"
                accept="image/*"
                className="mt-1 text-xs"
                disabled={uploading === "after"}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadImage("after", f)
                }}
              />
            </label>

            <div>
              <span className="text-sm font-medium">Alternativas</span>
              <div className="mt-2 space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={opt.label}
                      onChange={(e) => {
                        const next = [...options]
                        next[i] = { ...next[i], label: e.target.value }
                        setOptions(next)
                      }}
                      className="w-14 rounded border px-2 py-1 text-sm"
                      disabled={type === "certo_errado"}
                    />
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => {
                        const next = [...options]
                        next[i] = { ...next[i], text: e.target.value }
                        setOptions(next)
                      }}
                      className="flex-1 rounded border px-2 py-1 text-sm"
                    />
                    {type === "multiple_choice" && options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setOptions(options.filter((_, j) => j !== i))}
                        className="text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {type === "multiple_choice" && options.length < 8 && (
                <button
                  type="button"
                  onClick={() =>
                    setOptions([
                      ...options,
                      {
                        label: String.fromCharCode(65 + options.length),
                        text: "",
                      },
                    ])
                  }
                  className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600"
                >
                  <Plus className="h-3 w-3" /> Adicionar alternativa
                </button>
              )}
            </div>

            <div className="rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setShowGabarito((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
              >
                <span className="font-medium">Gabarito</span>
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  {showGabarito ? "Ocultar" : "Mostrar"}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showGabarito ? "rotate-180" : ""}`}
                  />
                </span>
              </button>
              {!showGabarito && (
                <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                  Oculto para não antecipar a resposta enquanto você edita.
                </p>
              )}
              {showGabarito && (
                <div className="border-t border-slate-100 px-3 pb-3 pt-2">
                  {type === "certo_errado" ? (
                    <select
                      value={correctAnswer}
                      onChange={(e) => setCorrectAnswer(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="Certo">Certo</option>
                      <option value="Errado">Errado</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={correctAnswer}
                      onChange={(e) => setCorrectAnswer(e.target.value.toUpperCase())}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="A, B, C…"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar correção
          </button>
        </div>
      </div>
    </div>
  )
}
