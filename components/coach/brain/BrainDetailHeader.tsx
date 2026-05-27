"use client"

import Link from "next/link"
import { Loader2, RefreshCw } from "lucide-react"
import { TREND_LABELS } from "@/lib/coach-labels"
import { trendBadgeClass } from "./brain-status-styles"

type Props = {
  subjectName: string
  updatedAt: string | null
  trend: string
  summaryMd: string | null
  lastReportId: string | null
  reportMerged: boolean
  dangerCount: number
  topicCount: number
  recomputing: boolean
  onRecompute: () => void
}

export default function BrainDetailHeader({
  subjectName,
  updatedAt,
  trend,
  summaryMd,
  lastReportId,
  reportMerged,
  dangerCount,
  topicCount,
  recomputing,
  onRecompute,
}: Props) {
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : null

  return (
    <section className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Cérebro — {subjectName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${trendBadgeClass(trend)}`}
            >
              {TREND_LABELS[trend] ?? trend}
            </span>
            {updatedLabel && (
              <span className="text-xs text-slate-500">
                Atualizado em {updatedLabel}
              </span>
            )}
            {reportMerged && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Sincronizado com relatório
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {topicCount} tópico{topicCount === 1 ? "" : "s"} mapeados
            {dangerCount > 0 && (
              <>
                {" "}
                · <span className="font-medium text-red-700">{dangerCount} em alerta</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lastReportId && (
            <Link
              href={`/coach/relatorios/${lastReportId}`}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
            >
              Último relatório
            </Link>
          )}
          <button
            type="button"
            onClick={onRecompute}
            disabled={recomputing}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {recomputing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar cérebro
          </button>
        </div>
      </div>
      {summaryMd && (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-white/80 p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
          {summaryMd}
        </div>
      )}
    </section>
  )
}
