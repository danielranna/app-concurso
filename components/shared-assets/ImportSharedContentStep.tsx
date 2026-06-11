"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react"
import SharedAssetEditor from "@/components/shared-assets/SharedAssetEditor"
import { SharedContentBlockList } from "@/components/questions/QuestionContentDisplay"
import type { ImportQuestionParseResult } from "@/lib/tec-pdf-parse-pipeline"
import { resolveSharedBlocksFromLinks, type SharedAsset } from "@/lib/shared-assets"

export type ImportPendingSharedLink = {
  assetId: string
  asset: SharedAsset
  tecIds: number[]
}

type Props = {
  userId: string
  questions: ImportQuestionParseResult[]
  pendingLinks: ImportPendingSharedLink[]
  onPendingLinksChange: (links: ImportPendingSharedLink[]) => void
  onBack: () => void
  onContinue: () => void
}

function statementPrefix(statement: string): string {
  const oneLine = statement.replace(/\s+/g, " ").trim()
  const texto = oneLine.match(/^(Texto\s+[\w\-./]+)/i)
  if (texto) return texto[1]
  return oneLine.slice(0, 120)
}

function statementPreview(statement: string) {
  const plain = statement.replace(/\s+/g, " ").trim()
  return plain.length > 160 ? `${plain.slice(0, 160)}…` : plain
}

export default function ImportSharedContentStep({
  userId,
  questions,
  pendingLinks,
  onPendingLinksChange,
  onBack,
  onContinue,
}: Props) {
  const [library, setLibrary] = useState<SharedAsset[]>([])
  const [loadingLib, setLoadingLib] = useState(true)
  const [selectedAsset, setSelectedAsset] = useState<SharedAsset | null>(null)
  const [selectedTecIds, setSelectedTecIds] = useState<Set<number>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/shared-assets?user_id=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => setLibrary((d.assets ?? []) as SharedAsset[]))
      .finally(() => setLoadingLib(false))
  }, [userId])

  const ordered = useMemo(
    () => [...questions].sort((a, b) => a.index - b.index),
    [questions]
  )

  const groups = useMemo(() => {
    const map = new Map<string, ImportQuestionParseResult[]>()
    for (const q of ordered) {
      const key = statementPrefix(q.merged.statement)
      const list = map.get(key) ?? []
      list.push(q)
      map.set(key, list)
    }
    return [...map.entries()]
      .filter(([, items]) => items.length > 1)
      .sort((a, b) => b[1].length - a[1].length)
  }, [ordered])

  const linkByTecId = useMemo(() => {
    const map = new Map<number, ImportPendingSharedLink>()
    for (const link of pendingLinks) {
      for (const tecId of link.tecIds) map.set(tecId, link)
    }
    return map
  }, [pendingLinks])

  function toggleTecId(tecId: number) {
    setSelectedTecIds((prev) => {
      const next = new Set(prev)
      if (next.has(tecId)) next.delete(tecId)
      else next.add(tecId)
      return next
    })
  }

  function selectGroup(items: ImportQuestionParseResult[]) {
    setSelectedTecIds(new Set(items.map((q) => q.tec_id)))
  }

  function applyLink() {
    if (!selectedAsset || selectedTecIds.size === 0) {
      setError("Escolha um conteúdo e pelo menos uma questão.")
      return
    }
    setError(null)
    const tecIds = [...selectedTecIds]
    const existing = pendingLinks.find((l) => l.assetId === selectedAsset.id)
    let next: ImportPendingSharedLink[]
    if (existing) {
      const merged = new Set([...existing.tecIds, ...tecIds])
      next = pendingLinks.map((l) =>
        l.assetId === selectedAsset.id
          ? { ...l, tecIds: [...merged] }
          : l
      )
    } else {
      next = [
        ...pendingLinks,
        { assetId: selectedAsset.id, asset: selectedAsset, tecIds },
      ]
    }
    onPendingLinksChange(next)
    setSelectedTecIds(new Set())
  }

  function removeLink(assetId: string) {
    onPendingLinksChange(pendingLinks.filter((l) => l.assetId !== assetId))
  }

  const previewBlocks = selectedAsset
    ? resolveSharedBlocksFromLinks([
        { assetId: selectedAsset.id, sortOrder: 0, asset: selectedAsset },
      ])
    : []

  if (showCreate) {
    return (
      <SharedAssetEditor
        userId={userId}
        onClose={() => setShowCreate(false)}
        onSaved={(asset) => {
          setLibrary((prev) => [asset, ...prev])
          setSelectedAsset(asset)
          setShowCreate(false)
        }}
      />
    )
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-4 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Vincular textos e imagens compartilhados</p>
        <p className="mt-1 text-slate-600">
          As questões já aparecem na ordem do PDF. Selecione as que usam o mesmo texto/tabela,
          associe o conteúdo e depois apague o trecho duplicado na revisão (ou ao editar cada
          questão).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3 rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">Conteúdo</p>
          {loadingLib ? (
            <p className="text-sm text-slate-500">Carregando biblioteca…</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs text-violet-800 hover:bg-violet-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Criar novo
                </button>
              </div>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {library.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedAsset(a)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                        selectedAsset?.id === a.id
                          ? "border-violet-400 bg-violet-50"
                          : "hover:border-slate-300"
                      }`}
                    >
                      <span className="font-medium">{a.label}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {a.kind === "image" ? "Imagem" : "Texto"}
                      </span>
                    </button>
                  </li>
                ))}
                {library.length === 0 && (
                  <p className="text-xs text-slate-500">Nenhum conteúdo ainda — crie o primeiro.</p>
                )}
              </ul>
              {previewBlocks.length > 0 && (
                <div className="border-t pt-3">
                  <p className="mb-2 text-xs font-medium text-slate-400">Pré-visualização</p>
                  <SharedContentBlockList blocks={previewBlocks} />
                </div>
              )}
              <button
                type="button"
                onClick={applyLink}
                disabled={!selectedAsset || selectedTecIds.size === 0}
                className="w-full rounded-lg bg-violet-700 px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                Vincular às {selectedTecIds.size > 0 ? `${selectedTecIds.size} ` : ""}questões
                selecionadas
              </button>
            </>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}

          {pendingLinks.length > 0 && (
            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-medium text-slate-500">Vínculos neste import</p>
              <ul className="space-y-2">
                {pendingLinks.map((link) => (
                  <li
                    key={link.assetId}
                    className="flex items-start justify-between gap-2 rounded border border-green-200 bg-green-50 px-2 py-1.5 text-xs"
                  >
                    <span>
                      <strong>{link.asset.label}</strong>
                      <span className="text-green-800">
                        {" "}
                        → {link.tecIds.length} questão(ões):{" "}
                        {link.tecIds.map((id) => `TEC ${id}`).join(", ")}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLink(link.assetId)}
                      className="shrink-0 text-red-600 hover:underline"
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {groups.length > 0 && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold text-amber-900">Grupos com início parecido</p>
              <p className="mt-1 text-xs text-amber-800">
                Clique para selecionar questões que provavelmente compartilham o mesmo texto.
              </p>
              <ul className="mt-2 space-y-1">
                {groups.slice(0, 8).map(([prefix, items]) => (
                  <li key={prefix}>
                    <button
                      type="button"
                      onClick={() => selectGroup(items)}
                      className="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-left text-xs hover:bg-amber-50"
                    >
                      <span className="font-medium">{items.length} questões</span>
                      <span className="ml-1 text-amber-900">— {prefix}…</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">
                Questões do PDF ({ordered.length})
              </p>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedTecIds(new Set(ordered.map((q) => q.tec_id)))}
                  className="text-blue-600 hover:underline"
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTecIds(new Set())}
                  className="text-slate-500 hover:underline"
                >
                  Limpar
                </button>
              </div>
            </div>
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {ordered.map((q) => {
                const linked = linkByTecId.get(q.tec_id)
                const checked = selectedTecIds.has(q.tec_id)
                return (
                  <li key={q.tec_id}>
                    <label
                      className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2 ${
                        checked ? "border-violet-300 bg-violet-50/50" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTecId(q.tec_id)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-500">
                          #{q.index} · TEC {q.tec_id}
                          {q.merged.tec_subject ? ` · ${q.merged.tec_subject}` : ""}
                          {linked && (
                            <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-green-800">
                              {linked.asset.label}
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-slate-700">
                          {statementPreview(q.merged.statement)}
                        </p>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded border px-4 py-2 text-sm"
        >
          <ChevronLeft className="h-4 w-4" /> Voltar à revisão
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-4 py-2 text-sm text-white"
        >
          Ir para confirmação <ChevronRight className="h-4 w-4" />
        </button>
        {pendingLinks.length === 0 && (
          <span className="self-center text-xs text-slate-500">
            Opcional — pode pular e vincular depois ao editar questões.
          </span>
        )}
      </div>
    </div>
  )
}
