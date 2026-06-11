"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"
import SharedAssetEditor from "@/components/shared-assets/SharedAssetEditor"
import type { SharedAsset } from "@/lib/shared-assets"

type NotebookQuestion = {
  question_id: string
  position: number
  questions: {
    id: string
    tec_id: number
    statement: string
    tec_subject?: string | null
  } | null
}

type Props = {
  userId: string
  notebookId: string
  notebookName: string
  onClose: () => void
}

export default function OrganizeContentModal({
  userId,
  notebookId,
  notebookName,
  onClose,
}: Props) {
  const [step, setStep] = useState<"pick" | "create" | "select">("pick")
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [library, setLibrary] = useState<SharedAsset[]>([])
  const [questions, setQuestions] = useState<NotebookQuestion[]>([])
  const [selectedAsset, setSelectedAsset] = useState<SharedAsset | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [libRes, nbRes] = await Promise.all([
        fetch(`/api/shared-assets?user_id=${encodeURIComponent(userId)}`),
        fetch(`/api/notebooks/${notebookId}`),
      ])
      const libData = await libRes.json()
      const nbData = await nbRes.json()
      setLibrary((libData.assets ?? []) as SharedAsset[])
      setQuestions((nbData.questions ?? []) as NotebookQuestion[])
      setLoading(false)
    }
    load()
  }, [userId, notebookId])

  function toggleQuestion(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(
      new Set(
        questions
          .map((q) => q.question_id ?? q.questions?.id)
          .filter((id): id is string => Boolean(id))
      )
    )
  }

  async function handleBulkLink() {
    if (!selectedAsset || selectedIds.size === 0) return
    setLinking(true)
    setError(null)
    const res = await fetch("/api/shared-assets/bulk-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        asset_id: selectedAsset.id,
        question_ids: [...selectedIds],
      }),
    })
    const data = await res.json()
    setLinking(false)
    if (!res.ok) {
      setError(data.error ?? "Erro ao vincular")
      return
    }
    setDone(true)
  }

  function statementPreview(statement: string) {
    const plain = statement.replace(/\s+/g, " ").trim()
    return plain.length > 120 ? `${plain.slice(0, 120)}…` : plain
  }

  if (step === "create" && userId) {
    return (
      <SharedAssetEditor
        userId={userId}
        onClose={() => setStep("pick")}
        onSaved={(asset) => {
          setLibrary((prev) => [asset, ...prev])
          setSelectedAsset(asset)
          setStep("select")
        }}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Organizar conteúdos</h2>
            <p className="text-sm text-slate-500">{notebookName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-slate-500">Carregando…</p>
        ) : done ? (
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm text-slate-700">
              Conteúdo vinculado a {selectedIds.size} questão(ões). Agora edite cada questão para
              apagar o texto duplicado do enunciado.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            >
              Fechar
            </button>
          </div>
        ) : step === "pick" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Escolha um conteúdo da biblioteca ou crie um novo para vincular às questões deste
              caderno.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("create")}
                className="rounded-lg border border-violet-200 px-3 py-2 text-sm text-violet-800 hover:bg-violet-50"
              >
                Criar novo conteúdo
              </button>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {library.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAsset(a)
                      setStep("select")
                    }}
                    className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:border-violet-300 hover:bg-violet-50"
                  >
                    <span className="font-medium">{a.label}</span>
                    <span className="text-xs text-slate-400">
                      {a.kind === "image" ? "Imagem" : "Texto"} · {a.questionCount ?? 0} questões
                    </span>
                  </button>
                </li>
              ))}
              {library.length === 0 && (
                <p className="text-sm text-slate-500">Nenhum conteúdo na biblioteca ainda.</p>
              )}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Vincular <strong>{selectedAsset?.label}</strong> às questões selecionadas:
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-blue-600 hover:underline"
              >
                Selecionar todas
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-slate-500 hover:underline"
              >
                Limpar
              </button>
            </div>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {questions.map((row) => {
                const q = row.questions
                const qid = row.question_id ?? q?.id
                if (!qid || !q) return null
                const checked = selectedIds.has(qid)
                return (
                  <li key={qid}>
                    <label className="flex cursor-pointer gap-3 rounded-lg border px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleQuestion(qid)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-500">
                          #{row.position} · TEC {q.tec_id}
                          {q.tec_subject ? ` · ${q.tec_subject}` : ""}
                        </p>
                        <p className="text-sm text-slate-700">{statementPreview(q.statement)}</p>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-between gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setStep("pick")}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleBulkLink}
                disabled={linking || selectedIds.size === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {linking && <Loader2 className="h-4 w-4 animate-spin" />}
                Vincular {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
