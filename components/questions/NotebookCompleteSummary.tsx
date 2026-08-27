"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ClipboardList, FileText } from "lucide-react"
import PerformanceStackBar from "@/components/questions/PerformanceStackBar"
import { formatElapsed } from "@/lib/format-elapsed"

type Stats = {
  total: number
  resolved: number
  correct: number
  wrong: number
  pending: number
}

type Props = {
  userId: string
  notebookId: string
  notebookName?: string
  stats: Stats
  elapsedMs: number
  initialReportId?: string | null
  reportPending?: boolean
  onReview?: () => void
  onCreateWrongNotebook?: () => Promise<void>
  creatingWrongNotebook?: boolean
  onResetNotebook?: (mode: "all" | "wrong") => Promise<void>
  resettingNotebook?: boolean
}

const POLL_MS = 3000
const POLL_MAX_TRIES = 40

export default function NotebookCompleteSummary({
  userId,
  notebookId,
  notebookName,
  stats,
  elapsedMs,
  initialReportId,
  reportPending = false,
  onReview,
  onCreateWrongNotebook,
  creatingWrongNotebook,
  onResetNotebook,
  resettingNotebook,
}: Props) {
  const [reportId, setReportId] = useState<string | null>(initialReportId ?? null)
  const [waitingReport, setWaitingReport] = useState(
    !initialReportId && (reportPending || stats.total > 0)
  )

  useEffect(() => {
    if (initialReportId) {
      setReportId(initialReportId)
      setWaitingReport(false)
      return
    }
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const tick = async () => {
      tries += 1
      try {
        const res = await fetch(
          `/api/coach/reports?user_id=${userId}&notebook_id=${notebookId}&compact=1`
        )
        const data = await res.json()
        const id = Array.isArray(data) ? data[0]?.id : data?.id
        if (cancelled) return
        if (typeof id === "string" && id) {
          setReportId(id)
          setWaitingReport(false)
          return
        }
      } catch {
        /* keep polling */
      }
      if (cancelled) return
      if (tries >= POLL_MAX_TRIES) {
        setWaitingReport(false)
        return
      }
      timer = setTimeout(tick, POLL_MS)
    }

    setWaitingReport(true)
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [userId, notebookId, initialReportId])

  const scored = stats.correct + stats.wrong
  const pct = scored > 0 ? Math.round((stats.correct / scored) * 100) : 0
  const avgMs = stats.total > 0 ? elapsedMs / stats.total : 0

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-xl border border-teal-200 bg-gradient-to-b from-teal-50 to-white p-8 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-teal-700">
          Caderno concluído
        </p>
        {notebookName && (
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{notebookName}</h2>
        )}
        <p className="mt-4 text-5xl font-semibold tabular-nums text-slate-900">{pct}%</p>
        <p className="mt-1 text-sm text-slate-500">de acerto nesta sessão</p>
        <div className="mx-auto mt-5 max-w-sm">
          <PerformanceStackBar
            correct={stats.correct}
            wrong={stats.wrong}
            showText
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Acertos" value={String(stats.correct)} accent="text-green-700" />
        <StatCard label="Erros" value={String(stats.wrong)} accent="text-red-700" />
        <StatCard label="Tempo" value={formatElapsed(elapsedMs)} />
        <StatCard
          label="Média / questão"
          value={stats.total > 0 ? formatElapsed(avgMs) : "—"}
        />
      </div>

      {stats.wrong > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {stats.wrong} questão{stats.wrong === 1 ? "" : "ões"} errada
          {stats.wrong === 1 ? "" : "s"}. Vale revisar no relatório e nas correções do
          dia.
        </p>
      )}
      {stats.wrong === 0 && scored > 0 && (
        <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Sessão limpa — nenhum erro neste caderno.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {reportId ? (
          <Link
            href={`/coach/relatorios/${reportId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
          >
            <FileText className="h-4 w-4" />
            Ver relatório
          </Link>
        ) : waitingReport ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-5 py-2.5 text-sm font-medium text-teal-800">
            Gerando relatório…
          </span>
        ) : (
          <Link
            href="/coach"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <FileText className="h-4 w-4" />
            Relatórios no Coach
          </Link>
        )}
        {stats.wrong > 0 && (
          <Link
            href="/questoes/revisao"
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-900 hover:bg-red-50"
          >
            <ClipboardList className="h-4 w-4" />
            Correções de hoje
          </Link>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-3 pt-1">
        {onReview && (
          <button
            type="button"
            onClick={onReview}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Revisar questões
          </button>
        )}
        {onResetNotebook && (
          <button
            type="button"
            onClick={() => onResetNotebook("all")}
            disabled={resettingNotebook}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {resettingNotebook ? "Zerando..." : "Refazer caderno"}
          </button>
        )}
        {onResetNotebook && stats.wrong > 0 && (
          <button
            type="button"
            onClick={() => onResetNotebook("wrong")}
            disabled={resettingNotebook}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {resettingNotebook ? "Zerando..." : `Refazer só erradas (${stats.wrong})`}
          </button>
        )}
        {onCreateWrongNotebook && stats.wrong > 0 && (
          <button
            type="button"
            onClick={() => onCreateWrongNotebook()}
            disabled={creatingWrongNotebook || resettingNotebook}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {creatingWrongNotebook
              ? "Criando..."
              : `Caderno das erradas (${stats.wrong})`}
          </button>
        )}
        <Link
          href="/questoes"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Voltar aos cadernos
        </Link>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accent ?? "text-slate-900"}`}>
        {value}
      </p>
    </div>
  )
}
