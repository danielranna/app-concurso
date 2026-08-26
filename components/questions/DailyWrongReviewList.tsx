"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ChevronDown, ExternalLink, Loader2 } from "lucide-react"
import type { DailyWrongItem, DailyWrongOption } from "@/lib/daily-wrong-attempts-types"
import { splitDailyWrongOptions } from "@/lib/daily-wrong-attempts-utils"
import { resolveQuestionContentBlocks } from "@/lib/question-content-blocks"
import QuestionContentDisplay from "@/components/questions/QuestionContentDisplay"
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

function optionDisplayText(
  opt: DailyWrongOption,
  questionType?: string | null
): { prefix: string | null; text: string } {
  const text = opt.text.trim()
  const sameLabel = opt.label.trim().toLowerCase() === text.toLowerCase()
  if (!text) return { prefix: `${opt.label})`, text: "" }
  if (questionType === "certo_errado" || sameLabel) {
    return { prefix: null, text }
  }
  return { prefix: `${opt.label})`, text }
}

function OptionBody({
  opt,
  questionType,
}: {
  opt: DailyWrongOption
  questionType?: string | null
}) {
  const { prefix, text } = optionDisplayText(opt, questionType)
  const html = text.includes("<")
  return (
    <div className="text-sm leading-relaxed text-slate-800">
      {prefix != null && <span className="font-semibold">{prefix} </span>}
      {text ? (
        html ? (
          <div
            className="prose prose-sm mt-1 max-w-none [&_img]:my-2 [&_img]:block [&_img]:h-auto [&_img]:max-w-full"
            dangerouslySetInnerHTML={{ __html: text }}
          />
        ) : (
          <span className="whitespace-pre-wrap">{text}</span>
        )
      ) : (
        <span className="text-slate-400">sem texto importado</span>
      )}
    </div>
  )
}

function fallbackOption(label: string): DailyWrongOption {
  return { label, text: "" }
}

function HighlightedAnswer({
  title,
  opt,
  questionType,
  variant,
}: {
  title: string
  opt: DailyWrongOption
  questionType?: string | null
  variant: "wrong" | "correct"
}) {
  const styles =
    variant === "wrong"
      ? "border-red-200 bg-red-50/80"
      : "border-emerald-200 bg-emerald-50/80"
  const badge =
    variant === "wrong"
      ? "bg-red-100 text-red-800"
      : "bg-emerald-100 text-emerald-800"

  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <p className={`mb-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge}`}>
        {title}
      </p>
      <OptionBody opt={opt} questionType={questionType} />
    </div>
  )
}

function DailyWrongReviewCard({ item }: { item: DailyWrongItem }) {
  const [showStatement, setShowStatement] = useState(true)
  const [showOthers, setShowOthers] = useState(false)
  const ctx = contextLabel(item)
  const hasStatement =
    Boolean(item.statement?.trim()) ||
    Boolean(item.content_before?.trim()) ||
    Boolean(item.content_after?.trim()) ||
    Boolean(
      item.content_blocks &&
        typeof item.content_blocks === "object" &&
        ((item.content_blocks as { before?: unknown[] }).before?.length ||
          (item.content_blocks as { after?: unknown[] }).after?.length)
    )

  const split = splitDailyWrongOptions(
    item.options ?? [],
    item.selected_answer,
    item.correct_answer
  )
  const marked = split.marked ?? fallbackOption(item.selected_answer)
  const gabarito = split.gabarito ?? fallbackOption(item.correct_answer)

  return (
    <article className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
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
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link
            href={`/questoes/questao/${item.question_id}?return=${encodeURIComponent("/questoes/revisao")}`}
          >
            Ver no app
          </Link>
        </Button>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowStatement((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={showStatement}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Enunciado
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            {showStatement ? "Ocultar" : "Mostrar"}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showStatement ? "rotate-180" : ""}`}
            />
          </span>
        </button>
        {showStatement && (
          <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            {hasStatement ? (
              <QuestionContentDisplay
                blocks={resolveQuestionContentBlocks({
                  content_blocks: item.content_blocks as never,
                  content_before: item.content_before,
                  content_after: item.content_after,
                })}
                statement={item.statement}
                statementClassName="whitespace-pre-wrap text-sm leading-relaxed text-slate-800"
              />
            ) : (
              <p className="text-sm text-slate-500">
                Enunciado não importado.{" "}
                <a
                  href={item.tec_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-teal-700 hover:underline"
                >
                  Abrir no TEC
                </a>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <HighlightedAnswer
          title="Você marcou"
          opt={marked}
          questionType={item.type}
          variant="wrong"
        />
        <HighlightedAnswer
          title="Gabarito"
          opt={gabarito}
          questionType={item.type}
          variant="correct"
        />
      </div>

      {split.others.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setShowOthers((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
            aria-expanded={showOthers}
          >
            <span className="text-sm font-medium text-slate-700">
              Outras alternativas
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                ({split.others.length})
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${showOthers ? "rotate-180" : ""}`}
            />
          </button>
          {showOthers && (
            <ul className="space-y-2 border-t border-slate-100 px-3 py-3">
              {split.others.map((opt) => (
                <li
                  key={opt.label}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <OptionBody opt={opt} questionType={item.type} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  )
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
        description="Quando você errar questões, elas aparecem aqui com enunciado, o que você marcou e o gabarito."
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
          {items.map((item) => (
            <DailyWrongReviewCard key={item.attempt_id} item={item} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
