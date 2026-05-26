"use client"

import { useEffect, useRef, useState } from "react"
import { Pause, Play } from "lucide-react"

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
  /** Para o cronômetro (ex.: caderno concluído). Não permite retomar manualmente. */
  paused?: boolean
  /** Exibe botão de pausar/retomar (pausa manual do usuário). */
  showPauseControl?: boolean
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
  showPauseControl = true,
}: Props) {
  const [elapsed, setElapsed] = useState(initialMs)
  const [userPaused, setUserPaused] = useState(false)
  const baseMs = useRef(initialMs)
  const startedAt = useRef(Date.now() - initialMs)
  const hydrated = useRef(false)
  const effectivePaused = paused || userPaused

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
    if (effectivePaused) {
      const frozen = Date.now() - startedAt.current
      setElapsed(frozen)
      onPersist(frozen)
      return
    }
    const tick = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current)
    }, 1000)
    return () => clearInterval(tick)
  }, [effectivePaused, onPersist])

  useEffect(() => {
    if (effectivePaused) return
    const save = window.setInterval(() => {
      onPersist(Date.now() - startedAt.current)
    }, persistIntervalMs)
    return () => clearInterval(save)
  }, [onPersist, persistIntervalMs, effectivePaused])

  useEffect(() => {
    const flush = () => {
      if (!effectivePaused) onPersist(Date.now() - startedAt.current)
    }
    window.addEventListener("beforeunload", flush)
    return () => window.removeEventListener("beforeunload", flush)
  }, [onPersist, effectivePaused])

  function toggleUserPause() {
    if (paused) return
    if (userPaused) {
      startedAt.current = Date.now() - elapsed
      setUserPaused(false)
    } else {
      const frozen = Date.now() - startedAt.current
      setElapsed(frozen)
      onPersist(frozen)
      setUserPaused(true)
    }
  }

  const pauseLabel = paused
    ? "Caderno concluído — tempo final"
    : userPaused
      ? "Cronômetro pausado"
      : "Tempo no caderno"

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`font-mono text-sm tabular-nums ${effectivePaused ? "text-slate-400" : "text-slate-500"}`}
        title={pauseLabel}
      >
        · {formatElapsed(elapsed)}
        {effectivePaused ? " (pausado)" : ""}
      </span>
      {showPauseControl && !paused && (
        <button
          type="button"
          onClick={toggleUserPause}
          className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          title={userPaused ? "Retomar cronômetro" : "Pausar cronômetro"}
          aria-label={userPaused ? "Retomar cronômetro" : "Pausar cronômetro"}
        >
          {userPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
      )}
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
