"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2 } from "lucide-react"
import type { DailyWrongItem } from "@/lib/daily-wrong-attempts-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { QuestoesEmptyState } from "@/components/questions/questoes-shell"

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
    return (
      <Card className="border-red-200 bg-red-50/60">
        <CardContent className="p-4 text-sm text-red-800">{error}</CardContent>
      </Card>
    )
  }

  if (!items.length) {
    return (
      <QuestoesEmptyState
        title="Nenhum erro neste dia — ótimo!"
        description="Quando você errar questões, elas aparecem aqui com gabarito e link para o TEC."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant="secondary">
          {items.length} {items.length === 1 ? "questão errada" : "questões erradas"}
        </Badge>
        <Button variant="secondary" size="sm" onClick={openAllInTec}>
          Abrir todos no TEC
        </Button>
      </div>

      <Card>
        <CardContent className="divide-y divide-slate-100 p-0">
          {items.map((item) => {
            const ctx = contextLabel(item)
            return (
              <div
                key={item.attempt_id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-slate-400">
                      {formatTime(item.created_at)}
                    </span>
                    <a
                      href={item.tec_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
                    >
                      TEC #{item.tec_id}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  {ctx && <p className="text-sm text-slate-500">{ctx}</p>}
                  <p className="text-sm text-slate-800">
                    Marcou <strong className="text-red-700">{item.selected_answer}</strong>
                    {" → "}
                    Gabarito <strong className="text-emerald-700">{item.correct_answer}</strong>
                  </p>
                </div>
                <Button variant="secondary" size="sm" asChild>
                  <Link
                    href={`/questoes/questao/${item.question_id}?return=${encodeURIComponent("/questoes/revisao")}`}
                  >
                    Ver no app
                  </Link>
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
