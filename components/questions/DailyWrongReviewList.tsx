"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2 } from "lucide-react"
import type { DailyWrongItem } from "@/lib/daily-wrong-attempts"

type Props = {
  userId: string
  date: string
  onCountChange?: (count: number) => void
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

function contextLabel(item: DailyWrongItem): string | null {
  const parts = [item.tec_subject, item.tec_topic].filter(Boolean)
  return parts.length ? parts.join(" · ") : null
}

export default function DailyWrongReviewList({ userId, date, onCountChange }: Props) {
  const [items, setItems] = useState<DailyWrongItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(
      `/api/questions/daily-wrongs?user_id=${encodeURIComponent(userId)}&date=${encodeURIComponent(date)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
          setItems([])
          onCountChange?.(0)
          return
        }
        const list = (data.items ?? []) as DailyWrongItem[]
        setItems(list)
        onCountChange?.(list.length)
      })
      .catch(() => {
        setError("Não foi possível carregar as correções.")
        setItems([])
        onCountChange?.(0)
      })
      .finally(() => setLoading(false))
  }, [userId, date, onCountChange])

  useEffect(() => {
    load()
  }, [load])

  function openAllInTec() {
    if (!items.length) return
    if (
      items.length > 5 &&
      !window.confirm(
        `Abrir ${items.length} abas no TEC? O navegador pode bloquear pop-ups — permita se necessário.`
      )
    ) {
      return
    }
    for (const item of items) {
      window.open(item.tec_url, "_blank", "noopener,noreferrer")
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <p className="font-medium text-green-800">Nenhum erro neste dia — ótimo!</p>
        <p className="mt-1 text-sm text-green-700">
          Quando você errar questões, elas aparecem aqui com gabarito e link para o TEC.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">{items.length}</strong>{" "}
          {items.length === 1 ? "questão errada" : "questões erradas"}
        </p>
        <button
          type="button"
          onClick={openAllInTec}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Abrir todos no TEC
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const ctx = contextLabel(item)
            return (
              <li
                key={item.attempt_id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-slate-400">
                      {formatTime(item.created_at)}
                    </span>
                    <a
                      href={item.tec_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
                    >
                      TEC #{item.tec_id}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  {ctx && <p className="text-sm text-slate-600">{ctx}</p>}
                  <p className="text-sm text-slate-800">
                    Marcou <strong>{item.selected_answer}</strong>
                    {" → "}
                    Gabarito <strong>{item.correct_answer}</strong>
                  </p>
                </div>
                <Link
                  href={`/questoes/questao/${item.question_id}?return=${encodeURIComponent("/questoes/revisao")}`}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Ver no app
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
