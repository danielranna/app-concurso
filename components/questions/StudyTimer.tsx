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
  /** Tempo acumulado já salvo (carregar uma vez no mount do pai). */
  initialMs: number
  onPersist: (ms: number) => void
  persistIntervalMs?: number
}

/**
 * Cronômetro do caderno/sessão — não reinicia ao trocar de questão.
 * Só reancora se initialMs crescer (valor vindo do servidor maior que o local).
 */
export default function StudyTimer({
  initialMs,
  onPersist,
  persistIntervalMs = 15000,
}: Props) {
  const [elapsed, setElapsed] = useState(initialMs)
  const baseMs = useRef(initialMs)
  const startedAt = useRef(Date.now() - initialMs)
  const hydrated = useRef(false)

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true
      baseMs.current = initialMs
      startedAt.current = Date.now() - initialMs
      setElapsed(initialMs)
      return
    }
    if (initialMs > baseMs.current) {
      baseMs.current = initialMs
      startedAt.current = Date.now() - initialMs
      setElapsed(initialMs)
    }
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
      onPersist(now)
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

function formatQuestionMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m > 0) return `${m}:${String(rem).padStart(2, "0")}`
  return `${s}s`
}

export function QuestionTimerDisplay({ ms }: { ms: number }) {
  return (
    <span className="text-xs text-slate-400" title="Tempo nesta questão">
      questão: {formatQuestionMs(ms)}
    </span>
  )
}
