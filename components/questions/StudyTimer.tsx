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
  /** Para o cronômetro (ex.: caderno concluído). */
  paused?: boolean
}

/**
 * Cronômetro do caderno/sessão — não reinicia ao trocar de questão.
 * Só reancora se initialMs crescer (valor vindo do servidor maior que o local).
 */
export default function StudyTimer({
  initialMs,
  onPersist,
  persistIntervalMs = 15000,
  paused = false,
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
    if (paused) {
      const frozen = Date.now() - startedAt.current
      setElapsed(frozen)
      onPersist(frozen)
      return
    }
    const tick = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current)
    }, 1000)
    return () => clearInterval(tick)
  }, [paused, onPersist])

  useEffect(() => {
    if (paused) return
    const save = window.setInterval(() => {
      onPersist(Date.now() - startedAt.current)
    }, persistIntervalMs)
    return () => clearInterval(save)
  }, [onPersist, persistIntervalMs, paused])

  useEffect(() => {
    const flush = () => {
      if (!paused) onPersist(Date.now() - startedAt.current)
    }
    window.addEventListener("beforeunload", flush)
    return () => window.removeEventListener("beforeunload", flush)
  }, [onPersist, paused])

  return (
    <span
      className={`font-mono text-sm tabular-nums ${paused ? "text-slate-400" : "text-slate-500"}`}
      title={paused ? "Caderno concluído — tempo final" : "Tempo no caderno"}
    >
      · {formatElapsed(elapsed)}
      {paused ? " (parado)" : ""}
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
