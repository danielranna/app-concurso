"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ImageIcon, Pencil, Plus, Trash2, Type } from "lucide-react"
import SharedAssetEditor from "@/components/shared-assets/SharedAssetEditor"
import { SharedContentPreview } from "@/components/questions/QuestionContentDisplay"
import { resolveSharedBlocksFromLinks, type SharedAsset } from "@/lib/shared-assets"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  QuestoesEmptyState,
  QuestoesPageHeader,
} from "@/components/questions/questoes-shell"

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
    <div className="space-y-6">
      <QuestoesPageHeader
        title="Conteúdos compartilhados"
        description="Textos, tabelas e imagens reutilizáveis. Vincule às questões na edição ou ao organizar um caderno importado."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Novo conteúdo
          </Button>
        }
      />

      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : assets.length === 0 ? (
        <QuestoesEmptyState
          title="Nenhum conteúdo na biblioteca ainda"
          action={
            <Button variant="secondary" onClick={() => setCreating(true)}>
              Criar o primeiro
            </Button>
          }
        />
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
              <li key={asset.id}>
                <Card>
                <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {asset.kind === "image" ? (
                        <ImageIcon className="h-4 w-4 text-slate-400" />
                      ) : (
                        <Type className="h-4 w-4 text-slate-400" />
                      )}
                      <p className="font-medium text-slate-900">{asset.label}</p>
                    </div>
                    {asset.title && (
                      <p className="mt-1 text-sm text-slate-600">{asset.title}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {asset.kind === "image" ? "Imagem" : "Texto / tabela"}
                      </Badge>
                      <Badge variant="secondary">
                        {asset.questionCount ?? 0} questão(ões)
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setExpandedId(expanded ? null : asset.id)}
                    >
                      {expanded ? "Ocultar" : "Pré-visualizar"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(asset)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(asset)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </Button>
                  </div>
                </div>
                {expanded && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <SharedContentPreview blocks={preview} maxHeightClass="max-h-48" />
                  </div>
                )}
                </CardContent>
                </Card>
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
