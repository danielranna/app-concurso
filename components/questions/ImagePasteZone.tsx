"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ClipboardPaste, Loader2 } from "lucide-react"
import { getImageFileFromPasteEvent } from "@/lib/clipboard-image"

type Props = {
  uploading?: boolean
  onPasteImage: (file: File) => void | Promise<void>
  className?: string
  autoFocus?: boolean
}

/** Área mínima só para colar — sem preview duplicada. */
export default function ImagePasteZone({
  uploading,
  onPasteImage,
  className = "",
  autoFocus = false,
}: Props) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!autoFocus) return
    const t = window.setTimeout(() => zoneRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [autoFocus])

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
    if (!focused) return
    const onDocPaste = (e: ClipboardEvent) => {
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
    <div
      ref={zoneRef}
      tabIndex={0}
      role="button"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPaste={(e) => void handlePaste(e)}
      onClick={() => zoneRef.current?.focus()}
      className={`cursor-text rounded-lg border border-dashed px-3 py-5 text-center outline-none transition ${className} ${
        focused
          ? "border-violet-400 bg-violet-50/50"
          : "border-slate-300 bg-slate-50 hover:border-violet-300"
      }`}
    >
      {uploading ? (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Enviando…
        </p>
      ) : (
        <>
          <ClipboardPaste className="mx-auto mb-1.5 h-6 w-6 text-slate-400" />
          <p className="text-sm text-slate-700">Clique e cole o print (Ctrl+V)</p>
        </>
      )}
    </div>
  )
}
