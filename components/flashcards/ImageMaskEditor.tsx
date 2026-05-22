"use client"

import { useRef, useState } from "react"
import type { ImageMask } from "@/lib/flashcard-types"

type Props = {
  imageUrl: string
  masks: ImageMask[]
  onChange: (masks: ImageMask[]) => void
}

export default function ImageMaskEditor({ imageUrl, masks, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null)

  function getRect(e: React.MouseEvent) {
    const el = containerRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
  }

  function onMouseDown(e: React.MouseEvent) {
    const pt = getRect(e)
    if (pt) setDragging(pt)
  }

  function onMouseUp(e: React.MouseEvent) {
    if (!dragging) return
    const pt = getRect(e)
    if (!pt) return
    const x = Math.min(dragging.x, pt.x)
    const y = Math.min(dragging.y, pt.y)
    const w = Math.abs(pt.x - dragging.x)
    const h = Math.abs(pt.y - dragging.y)
    if (w > 0.02 && h > 0.02) {
      onChange([...masks, { x, y, w, h }])
    }
    setDragging(null)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">Arraste na imagem para criar máscaras de oclusão.</p>
      <div
        ref={containerRef}
        className="relative inline-block max-w-full cursor-crosshair select-none"
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Card" className="max-h-96 rounded-lg border" draggable={false} />
        {masks.map((m, i) => (
          <div
            key={i}
            className="absolute border-2 border-amber-500 bg-amber-500/40"
            style={{
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              width: `${m.w * 100}%`,
              height: `${m.h * 100}%`,
            }}
          />
        ))}
        {dragging && (
          <div className="pointer-events-none absolute inset-0 bg-slate-900/10" />
        )}
      </div>
      {masks.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-sm text-red-600 hover:underline"
        >
          Limpar máscaras ({masks.length})
        </button>
      )}
    </div>
  )
}
