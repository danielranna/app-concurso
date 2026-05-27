"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { BRAIN_STATUS_LABELS, ERROR_TAXONOMY_LABELS } from "@/lib/coach-labels"
import type { ErrorTaxonomy } from "@/lib/coach-types"
import type { PriorityBreakdownRow } from "@/lib/ai/priority-breakdown"

export type BrainTopicHint = {
  last_insight?: string
  predominant_error?: ErrorTaxonomy
  status?: string
}

export type PriorityPanelVariant = "edital" | "brain" | "crossed" | "unattempted"

export default function PriorityRankingPanel({
  title,
  subtitle,
  items,
  loading,
  variant,
  emptyMessage,
  collapseAfter = 0,
  highlighted,
  brainByTopic,
  bare,
}: {
  title: string
  subtitle?: string
  items: PriorityBreakdownRow[]
  loading?: boolean
  variant: PriorityPanelVariant
  emptyMessage?: string
  collapseAfter?: number
  highlighted?: boolean
  brainByTopic?: Record<string, BrainTopicHint>
  /** Sem borda/card externo (uso dentro de outra seção) */
  bare?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  if (loading) {
    return (
      <div
        className={`rounded-xl border p-4 ${
          highlighted ? "border-violet-400 bg-violet-50/50" : "border-slate-200 bg-white"
        }`}
      >
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      </div>
    )
  }

  const defaultEmpty =
    variant === "brain"
      ? "Nenhum tópico com questões resolvidas nesta matéria."
      : variant === "unattempted"
        ? "Todos os tópicos de alta incidência já têm pelo menos uma tentativa."
        : "Nenhum tópico encontrado."

  const maxScore = Math.max(...items.map((i) => i.score), 0.01)
  const shouldCollapse =
    collapseAfter > 0 && items.length > collapseAfter && !expanded
  const visibleItems = shouldCollapse ? items.slice(0, collapseAfter) : items
  const hiddenCount = items.length - collapseAfter

  const wrapperClass = bare
    ? "flex h-full flex-col"
    : `flex h-full flex-col rounded-xl border p-4 ${
        highlighted
          ? "border-violet-400 bg-violet-50/40 shadow-sm"
          : "border-slate-200 bg-white"
      }`

  return (
    <div className={wrapperClass}>
      {(title || subtitle) && (
        <div className="mb-3">
          {title && (
            <h3
              className={`text-sm font-semibold uppercase tracking-wide ${
                highlighted ? "text-violet-900" : "text-slate-700"
              }`}
            >
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
          )}
        </div>
      )}

      {!items.length ? (
        <p className="py-4 text-sm text-slate-500">
          {emptyMessage ?? defaultEmpty}
        </p>
      ) : (
        <>
          <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {visibleItems.map((item) => {
              const brain = brainByTopic?.[item.topic_key]
              return (
              <li
                key={item.topic_key}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">
                      {item.rank ?? "—"}
                    </span>
                    <span className="font-medium text-slate-900">
                      {item.topic_label}
                    </span>
                    {variant === "crossed" && item.reason && (
                      <p className="mt-1 pl-7 text-xs text-slate-600 line-clamp-2">
                        {item.reason.split("[rank=")[0].trim()}
                      </p>
                    )}
                    {brain?.last_insight && (
                      <p className="mt-1.5 pl-7 text-xs text-emerald-800">
                        <span className="font-medium">Equívoco detectado: </span>
                        {brain.last_insight}
                      </p>
                    )}
                    {!brain?.last_insight && brain?.predominant_error && (
                      <p className="mt-1 pl-7 text-xs text-emerald-700">
                        Tipo de erro:{" "}
                        {ERROR_TAXONOMY_LABELS[brain.predominant_error] ??
                          brain.predominant_error}
                      </p>
                    )}
                    {brain?.status && (
                      <p className="mt-0.5 pl-7 text-[10px] text-slate-500">
                        Cérebro: {BRAIN_STATUS_LABELS[brain.status] ?? brain.status}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {item.score.toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      highlighted ? "bg-violet-600" : "bg-violet-400"
                    }`}
                    style={{
                      width: `${Math.min(100, (item.score / maxScore) * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2 pl-7 text-[10px] text-slate-500">
                  {(variant === "edital" ||
                    variant === "crossed" ||
                    variant === "unattempted") && (
                    <>
                      {item.edital_weight > 0 && (
                        <span>Edital ×{item.edital_weight.toFixed(1)}</span>
                      )}
                      <span>Incid. ×{item.incidence_weight.toFixed(1)}</span>
                    </>
                  )}
                  {(variant === "brain" || variant === "crossed") &&
                    item.dominio != null && (
                      <span>Domínio {Math.round(item.dominio * 100)}%</span>
                    )}
                  {(variant === "brain" || variant === "crossed") &&
                    item.brain_status && (
                      <span>
                        {BRAIN_STATUS_LABELS[item.brain_status] ??
                          item.brain_status}
                      </span>
                    )}
                  {variant === "brain" && item.wrong_count > 0 && (
                    <span>{item.wrong_count} erros</span>
                  )}
                  {variant === "unattempted" && (
                    <span className="text-amber-700">0 tentativas</span>
                  )}
                </div>
              </li>
            )})}
          </ol>
          {collapseAfter > 0 && items.length > collapseAfter && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Mostrar menos
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Ver mais {hiddenCount}
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
