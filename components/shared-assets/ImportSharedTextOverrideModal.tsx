"use client"

import { useState } from "react"
import { Loader2, RotateCcw, X } from "lucide-react"
import RichTextEditor from "@/components/RichTextEditor"
import type { SharedAsset } from "@/lib/shared-assets"

type Props = {
  tecId: number
  questionIndex: number
  asset: SharedAsset
  contentOverride: string | null
  onClose: () => void
  onSave: (contentOverride: string | null) => void
}

export default function ImportSharedTextOverrideModal({
  tecId,
  questionIndex,
  asset,
  contentOverride,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(contentOverride ?? asset.content)
  const [saving, setSaving] = useState(false)
  const isPersonalized = Boolean(contentOverride?.trim())

  function handleSave() {
    setSaving(true)
    const trimmed = draft.trim()
    const base = asset.content.trim()
    if (!trimmed || trimmed === base) onSave(null)
    else onSave(trimmed)
    setSaving(false)
    onClose()
  }

  function handleUseOriginal() {
    setDraft(asset.content)
    onSave(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Personalizar texto associado</h2>
            <p className="text-sm text-slate-500">
              #{questionIndex} · TEC {tecId} · {asset.label}
              {isPersonalized ? " · personalizado" : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-600">
          Destaque trechos relevantes só para esta questão. Use o botão de destaque na barra de
          ferramentas.
        </p>
        <RichTextEditor value={draft} onChange={setDraft} rows={12} />
        <div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-4">
          <button
            type="button"
            onClick={handleUseOriginal}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm text-slate-600"
          >
            <RotateCcw className="h-4 w-4" /> Usar original
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar personalização
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
