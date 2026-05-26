"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { GripVertical } from "lucide-react"

const MIN_PCT = 15
const MAX_PCT = 100
const DEFAULT_PCT = 45

export function clampImageWidthPct(n: number | undefined): number {
  if (n == null || Number.isNaN(n)) return DEFAULT_PCT
  return Math.round(Math.min(MAX_PCT, Math.max(MIN_PCT, n)))
}

type Props = {
  src: string
  widthPct?: number
  editable?: boolean
  onWidthChange?: (pct: number) => void
  className?: string
}

/** Imagem sem borda; tamanho controlado por % da largura do enunciado. */
export default function ResizableQuestionImage({
  src,
  widthPct = DEFAULT_PCT,
  editable = false,
  onWidthChange,
  className = "",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pct = clampImageWidthPct(widthPct)
  const [dragging, setDragging] = useState(false)
  const [localPct, setLocalPct] = useState(pct)

  useEffect(() => {
    setLocalPct(pct)
  }, [pct])

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (!editable || !onWidthChange) return
      e.preventDefault()
      setDragging(true)
      const startX = e.clientX
      const startPct = localPct
      const parentW = wrapRef.current?.parentElement?.clientWidth ?? 600

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        const next = clampImageWidthPct(startPct + (delta / parentW) * 100)
        setLocalPct(next)
        onWidthChange(next)
      }
      const onUp = () => {
        setDragging(false)
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [editable, localPct, onWidthChange]
  )

  return (
    <div className={`my-2 max-w-full ${className}`}>
      <div
        ref={wrapRef}
        className={`relative inline-block max-w-full ${dragging ? "select-none" : ""}`}
        style={{ width: `${localPct}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="block h-auto max-w-full w-full"
          draggable={false}
        />
        {editable && onWidthChange && (
          <button
            type="button"
            onMouseDown={onResizeStart}
            className="absolute -right-1 bottom-2 top-2 flex w-3 cursor-ew-resize items-center justify-center rounded bg-violet-600/80 text-white hover:bg-violet-700"
            title="Arrastar para redimensionar"
            aria-label="Redimensionar imagem"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
      {editable && onWidthChange && (
        <div className="mt-1.5 flex max-w-full items-center gap-2">
          <input
            type="range"
            min={MIN_PCT}
            max={MAX_PCT}
            value={localPct}
            onChange={(e) => {
              const next = clampImageWidthPct(Number(e.target.value))
              setLocalPct(next)
              onWidthChange(next)
            }}
            className="h-1.5 flex-1 cursor-pointer accent-violet-600"
          />
          <span className="w-10 shrink-0 text-right text-[10px] text-slate-500">
            {localPct}%
          </span>
        </div>
      )}
    </div>
  )
}
