"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ClipboardPaste, Loader2 } from "lucide-react"
import { getImageFileFromPasteEvent } from "@/lib/clipboard-image"

type Props = {
  imageUrl?: string
  uploading?: boolean
  onPasteImage: (file: File) => void | Promise<void>
  className?: string
  /** Foca a zona ao montar (bloco de imagem novo) */
  autoFocus?: boolean
}

/** Área focável só para colar print (Ctrl+V) — sem input de arquivo. */
export default function ImagePasteZone({
  imageUrl,
  uploading,
  onPasteImage,
  className = "",
  autoFocus = false,
}: Props) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!autoFocus || imageUrl?.trim()) return
    const t = window.setTimeout(() => zoneRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [autoFocus, imageUrl])

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent | ClipboardEvent) => {
      const file = getImageFileFromPasteEvent(e)
      if (!file) return
      e.preventDefault()
      e.stopPropagation()
      await onPasteImage(file)
    },
    [onPasteImage]
  )

  useEffect(() => {
    const el = zoneRef.current
    if (!el) return
    const onDocPaste = (e: ClipboardEvent) => {
      if (!focused) return
      const file = getImageFileFromPasteEvent(e)
      if (!file) return
      e.preventDefault()
      e.stopPropagation()
      void onPasteImage(file)
    }
    document.addEventListener("paste", onDocPaste)
    return () => document.removeEventListener("paste", onDocPaste)
  }, [focused, onPasteImage])

  return (
    <div className={className}>
      {imageUrl?.trim() ? (
        <img
          src={imageUrl}
          alt=""
          className="mb-3 max-h-56 w-full rounded-lg border border-slate-200 bg-white object-contain"
        />
      ) : null}
      <div
        ref={zoneRef}
        tabIndex={0}
        role="button"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPaste={(e) => void handlePaste(e)}
        onClick={() => zoneRef.current?.focus()}
        className={`cursor-text rounded-lg border-2 border-dashed px-4 py-8 text-center outline-none transition ${
          focused
            ? "border-violet-500 bg-violet-50/80 ring-2 ring-violet-200"
            : "border-slate-300 bg-white hover:border-violet-300 hover:bg-slate-50"
        }`}
      >
        {uploading ? (
          <p className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Enviando imagem…
          </p>
        ) : (
          <>
            <ClipboardPaste className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-800">
              Clique aqui e cole o print
            </p>
            <p className="mt-1 text-xs text-slate-500">
              <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">
                Ctrl
              </kbd>
              {" + "}
              <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">
                V
              </kbd>
              {" "}— Ferramenta de Captura, Print Screen, etc.
            </p>
          </>
        )}
      </div>
      {imageUrl?.trim() && !uploading && (
        <p className="mt-2 text-center text-xs text-slate-500">
          Clique na área tracejada e cole de novo para substituir
        </p>
      )}
    </div>
  )
}
