"use client"

import { useEffect, useRef, useState } from "react"

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":")
}

type Props = {
  initialMs: number
  onPersist: (ms: number) => void
  persistIntervalMs?: number
}

export default function StudyTimer({
  initialMs,
  onPersist,
  persistIntervalMs = 15000,
}: Props) {
  const [elapsed, setElapsed] = useState(initialMs)
  const startedAt = useRef(Date.now() - initialMs)
  const lastPersist = useRef(initialMs)

  useEffect(() => {
    startedAt.current = Date.now() - initialMs
    setElapsed(initialMs)
    lastPersist.current = initialMs
  }, [initialMs])

  useEffect(() => {
    const tick = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current)
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    const save = window.setInterval(() => {
      const now = Date.now() - startedAt.current
      if (now - lastPersist.current >= 5000) {
        lastPersist.current = now
        onPersist(now)
      }
    }, persistIntervalMs)
    return () => clearInterval(save)
  }, [onPersist, persistIntervalMs])

  useEffect(() => {
    const flush = () => onPersist(Date.now() - startedAt.current)
    window.addEventListener("beforeunload", flush)
    return () => window.removeEventListener("beforeunload", flush)
  }, [onPersist])

  return (
    <span className="font-mono text-sm tabular-nums text-slate-500" title="Tempo no caderno">
      · {formatElapsed(elapsed)}
    </span>
  )
}
