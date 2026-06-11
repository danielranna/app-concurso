"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import RichTextEditor from "@/components/RichTextEditor"
import SharedAssetEditor from "@/components/shared-assets/SharedAssetEditor"
import { SharedContentBlockList } from "@/components/questions/QuestionContentDisplay"
import {
  resolveSharedBlocksFromLinks,
  type QuestionAssetLinkWithAsset,
  type SharedAsset,
} from "@/lib/shared-assets"

type Props = {
  userId: string
  questionId: string
  onChange?: (links: QuestionAssetLinkWithAsset[]) => void
}

export default function QuestionSharedAssetsSection({
  userId,
  questionId,
  onChange,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [links, setLinks] = useState<QuestionAssetLinkWithAsset[]>([])
  const [library, setLibrary] = useState<SharedAsset[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editingOverride, setEditingOverride] = useState<string | null>(null)
  const [overrideDraft, setOverrideDraft] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const [linksRes, libRes] = await Promise.all([
      fetch(`/api/questions/${questionId}/shared-assets?user_id=${encodeURIComponent(userId)}`),
      fetch(`/api/shared-assets?user_id=${encodeURIComponent(userId)}`),
    ])
    const linksData = await linksRes.json()
    const libData = await libRes.json()
    const nextLinks = (linksData.links ?? []) as QuestionAssetLinkWithAsset[]
    setLinks(nextLinks)
    setLibrary((libData.assets ?? []) as SharedAsset[])
    onChange?.(nextLinks)
    setLoading(false)
  }, [questionId, userId, onChange])

  useEffect(() => {
    load()
  }, [load])

  async function persist(nextLinks: QuestionAssetLinkWithAsset[]) {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/questions/${questionId}/shared-assets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        links: nextLinks.map((l, i) => ({
          assetId: l.assetId,
          sortOrder: i,
          contentOverride: l.contentOverride ?? null,
        })),
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar vínculos")
      return
    }
    const saved = (data.links ?? []) as QuestionAssetLinkWithAsset[]
    setLinks(saved)
    onChange?.(saved)
  }

  function addAsset(asset: SharedAsset) {
    if (links.some((l) => l.assetId === asset.id)) {
      setShowPicker(false)
      return
    }
    const next = [
      ...links,
      {
        assetId: asset.id,
        sortOrder: links.length,
        contentOverride: null,
        asset,
      },
    ]
    setShowPicker(false)
    persist(next)
  }

  function removeLink(assetId: string) {
    persist(links.filter((l) => l.assetId !== assetId))
  }

  function startPersonalize(assetId: string) {
    const link = links.find((l) => l.assetId === assetId)
    if (!link) return
    setEditingOverride(assetId)
    setOverrideDraft(link.contentOverride ?? link.asset.content)
  }

  function saveOverride(assetId: string) {
    const next = links.map((l) =>
      l.assetId === assetId ? { ...l, contentOverride: overrideDraft.trim() || null } : l
    )
    setEditingOverride(null)
    persist(next)
  }

  function clearOverride(assetId: string) {
    const next = links.map((l) =>
      l.assetId === assetId ? { ...l, contentOverride: null } : l
    )
    setEditingOverride(null)
    persist(next)
  }

  const available = library.filter((a) => !links.some((l) => l.assetId === a.id))
  const previewBlocks = resolveSharedBlocksFromLinks(links)

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando conteúdos associados…</p>
  }

  return (
    <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">Conteúdos associados</p>
          <p className="text-xs text-slate-500">
            Textos, tabelas ou imagens compartilhados da sua biblioteca.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-50"
          >
            <Plus className="h-3.5 w-3.5" /> Criar novo
          </button>
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            disabled={!available.length}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-800 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Associar
            <ChevronDown className={`h-3.5 w-3.5 transition ${showPicker ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {showPicker && (
        <div className="mt-3 rounded-lg border border-violet-200 bg-white p-2">
          {available.length === 0 ? (
            <p className="px-2 py-1 text-xs text-slate-500">Nenhum conteúdo disponível.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {available.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => addAsset(a)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-violet-50"
                  >
                    <span>
                      <span className="font-medium">{a.label}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {a.kind === "image" ? "Imagem" : "Texto"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {links.length > 0 && (
        <ul className="mt-3 space-y-2">
          {links.map((link) => (
            <li
              key={link.assetId}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{link.asset.label}</p>
                  <p className="text-xs text-slate-500">
                    {link.asset.kind === "image" ? "Imagem" : "Texto"}
                    {link.contentOverride ? " · personalizado" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {link.asset.kind === "text" && (
                    <>
                      <button
                        type="button"
                        onClick={() => startPersonalize(link.assetId)}
                        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        <Pencil className="h-3 w-3" /> Personalizar
                      </button>
                      {link.contentOverride && (
                        <button
                          type="button"
                          onClick={() => clearOverride(link.assetId)}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          <RotateCcw className="h-3 w-3" /> Usar original
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeLink(link.assetId)}
                    className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" /> Remover
                  </button>
                </div>
              </div>

              {editingOverride === link.assetId ? (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <p className="text-xs text-slate-500">
                    Edite o texto para destacar trechos relevantes nesta questão.
                  </p>
                  <RichTextEditor
                    value={overrideDraft}
                    onChange={setOverrideDraft}
                    rows={8}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveOverride(link.assetId)}
                      className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white"
                    >
                      Salvar personalização
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingOverride(null)}
                      className="rounded border px-3 py-1.5 text-xs"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {previewBlocks.length > 0 && (
        <div className="mt-4 border-t border-violet-100 pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Pré-visualização
          </p>
          <SharedContentBlockList blocks={previewBlocks} />
        </div>
      )}

      {saving && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {showCreate && (
        <SharedAssetEditor
          userId={userId}
          onClose={() => setShowCreate(false)}
          onSaved={(asset) => {
            setLibrary((prev) => [asset, ...prev])
            addAsset(asset)
          }}
        />
      )}
    </div>
  )
}
