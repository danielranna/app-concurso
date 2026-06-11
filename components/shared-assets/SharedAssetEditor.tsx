"use client"

import { useEffect, useState } from "react"
import { ImageIcon, Loader2, Type, X } from "lucide-react"
import RichTextEditor from "@/components/RichTextEditor"
import ImagePasteZone from "@/components/questions/ImagePasteZone"
import ResizableQuestionImage from "@/components/questions/ResizableQuestionImage"
import type { SharedAsset, SharedAssetKind } from "@/lib/shared-assets"

type Props = {
  userId: string
  asset?: SharedAsset | null
  defaultKind?: SharedAssetKind
  onSaved: (asset: SharedAsset) => void
  onClose: () => void
}

async function uploadImage(userId: string, file: File): Promise<string | null> {
  const fd = new FormData()
  fd.append("user_id", userId)
  fd.append("file", file)
  const res = await fetch("/api/questions/upload", { method: "POST", body: fd })
  const data = await res.json()
  return res.ok ? (data.url as string) : null
}

export default function SharedAssetEditor({
  userId,
  asset,
  defaultKind = "text",
  onSaved,
  onClose,
}: Props) {
  const [kind, setKind] = useState<SharedAssetKind>(asset?.kind ?? defaultKind)
  const [label, setLabel] = useState(asset?.label ?? "")
  const [title, setTitle] = useState(asset?.title ?? "")
  const [fonte, setFonte] = useState(asset?.fonte ?? "")
  const [content, setContent] = useState(asset?.content ?? "")
  const [widthPct, setWidthPct] = useState(asset?.widthPct ?? 100)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!asset) return
    setKind(asset.kind)
    setLabel(asset.label)
    setTitle(asset.title ?? "")
    setFonte(asset.fonte ?? "")
    setContent(asset.content)
    setWidthPct(asset.widthPct ?? 100)
  }, [asset])

  async function handleImagePaste(file: File) {
    setUploading(true)
    const url = await uploadImage(userId, file)
    setUploading(false)
    if (url) setContent(url)
    else setError("Falha ao enviar imagem")
  }

  async function handleSave() {
    if (!label.trim()) {
      setError("Rótulo obrigatório")
      return
    }
    if (!content.trim()) {
      setError("Conteúdo obrigatório")
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      user_id: userId,
      kind,
      label: label.trim(),
      title: kind === "text" ? title.trim() || null : null,
      fonte: kind === "text" ? fonte.trim() || null : null,
      content: content.trim(),
      width_pct: kind === "image" ? widthPct : null,
    }

    const res = await fetch(asset ? `/api/shared-assets/${asset.id}` : "/api/shared-assets", {
      method: asset ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar")
      return
    }

    onSaved(data.asset as SharedAsset)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {asset ? "Editar conteúdo" : "Novo conteúdo compartilhado"}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind("text")}
              className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm ${
                kind === "text"
                  ? "border-violet-400 bg-violet-50 text-violet-800"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              <Type className="h-4 w-4" /> Texto / tabela
            </button>
            <button
              type="button"
              onClick={() => setKind("image")}
              className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm ${
                kind === "image"
                  ? "border-violet-400 bg-violet-50 text-violet-800"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              <ImageIcon className="h-4 w-4" /> Imagem
            </button>
          </div>

          <label className="block text-sm">
            <span className="font-medium">Rótulo</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: Texto CG2A4-I, BP + DRE"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>

          {kind === "text" && (
            <>
              <label className="block text-sm">
                <span className="font-medium">Título (opcional)</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Texto 1"
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Fonte (opcional)</span>
                <textarea
                  value={fonte}
                  onChange={(e) => setFonte(e.target.value)}
                  rows={2}
                  placeholder="Ex.: Adaptado de Fulano (2019). Disponível em: …"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
            </>
          )}

          {kind === "text" ? (
            <div>
              <span className="text-sm font-medium">Conteúdo</span>
              <div className="mt-1">
                <RichTextEditor
                  value={content}
                  onChange={setContent}
                  rows={10}
                  placeholder="Cole ou digite o texto formatado…"
                  onImageUpload={(file) => uploadImage(userId, file)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <span className="text-sm font-medium">Imagem</span>
              {content ? (
                <ResizableQuestionImage src={content} widthPct={widthPct} />
              ) : (
                <ImagePasteZone
                  uploading={uploading}
                  onPasteImage={handleImagePaste}
                  autoFocus
                />
              )}
              {content && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    Largura
                    <input
                      type="range"
                      min={15}
                      max={100}
                      value={widthPct}
                      onChange={(e) => setWidthPct(Number(e.target.value))}
                    />
                    <span className="w-10 text-right">{widthPct}%</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setContent("")}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Trocar imagem
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2 border-t pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
