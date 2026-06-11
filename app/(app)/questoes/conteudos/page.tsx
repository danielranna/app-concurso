"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, ImageIcon, Pencil, Plus, Trash2, Type } from "lucide-react"
import SharedAssetEditor from "@/components/shared-assets/SharedAssetEditor"
import { SharedContentBlockList } from "@/components/questions/QuestionContentDisplay"
import { resolveSharedBlocksFromLinks, type SharedAsset } from "@/lib/shared-assets"

export default function ConteudosPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [assets, setAssets] = useState<SharedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<SharedAsset | null>(null)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const reload = useCallback(async (uid: string) => {
    setLoading(true)
    const res = await fetch(`/api/shared-assets?user_id=${encodeURIComponent(uid)}`)
    const data = await res.json()
    setAssets((data.assets ?? []) as SharedAsset[])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reload(user.id)
    })
  }, [router, reload])

  async function handleDelete(asset: SharedAsset) {
    if (!userId) return
    const count = asset.questionCount ?? 0
    const msg =
      count > 0
        ? `Excluir "${asset.label}"? Está vinculado a ${count} questão(ões).`
        : `Excluir "${asset.label}"?`
    if (!confirm(msg)) return

    await fetch(`/api/shared-assets/${asset.id}?user_id=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    })
    reload(userId)
    if (expandedId === asset.id) setExpandedId(null)
  }

  return (
    <div>
      <Link
        href="/questoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Conteúdos compartilhados</h1>
          <p className="mt-1 text-sm text-slate-600">
            Textos, tabelas e imagens reutilizáveis. Vincule às questões na edição ou ao organizar
            um caderno importado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
        >
          <Plus className="h-4 w-4" /> Novo conteúdo
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">Carregando…</p>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-slate-600">Nenhum conteúdo na biblioteca ainda.</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-3 text-sm font-medium text-violet-700 hover:underline"
          >
            Criar o primeiro
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {assets.map((asset) => {
            const expanded = expandedId === asset.id
            const preview = resolveSharedBlocksFromLinks([
              {
                assetId: asset.id,
                sortOrder: 0,
                asset,
              },
            ])
            return (
              <li key={asset.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {asset.kind === "image" ? (
                        <ImageIcon className="h-4 w-4 text-slate-400" />
                      ) : (
                        <Type className="h-4 w-4 text-slate-400" />
                      )}
                      <p className="font-semibold text-slate-900">{asset.label}</p>
                    </div>
                    {asset.title && (
                      <p className="mt-1 text-sm text-slate-600">{asset.title}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {asset.kind === "image" ? "Imagem" : "Texto / tabela"} ·{" "}
                      {asset.questionCount ?? 0} questão(ões) vinculada(s)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : asset.id)}
                      className="rounded-lg border px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      {expanded ? "Ocultar" : "Pré-visualizar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(asset)}
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(asset)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="mt-4 border-t pt-4">
                    <SharedContentBlockList blocks={preview} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {userId && creating && (
        <SharedAssetEditor
          userId={userId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            reload(userId)
          }}
        />
      )}

      {userId && editing && (
        <SharedAssetEditor
          userId={userId}
          asset={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload(userId)
          }}
        />
      )}
    </div>
  )
}
