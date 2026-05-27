"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  cancelIngestBatchOnVps,
  EFFECTIVE_STEP_LABELS,
  fetchIngestStatus,
  reindexDocumentInQueue,
  runIngestBatchOnVps,
  workRemainingFromSummary,
  type EffectiveIngestStep,
  type IngestStatusDetails,
} from "@/lib/coach-ingest-worker-client"

const PAGE_SIZE = 50
const POLL_MS = 12_000

const STEP_CARD_ORDER: EffectiveIngestStep[] = [
  "queued",
  "needs_parse",
  "needs_chunk",
  "needs_embed",
  "rag_partial",
  "processing",
  "failed",
  "rag_done",
]

const STEP_CARD_STYLE: Record<
  EffectiveIngestStep,
  { ring: string; bg: string; text: string }
> = {
  queued: { ring: "ring-slate-300", bg: "bg-slate-50", text: "text-slate-800" },
  processing: { ring: "ring-amber-300", bg: "bg-amber-50", text: "text-amber-900" },
  needs_parse: { ring: "ring-sky-300", bg: "bg-sky-50", text: "text-sky-900" },
  needs_chunk: { ring: "ring-emerald-300", bg: "bg-emerald-50", text: "text-emerald-900" },
  needs_embed: { ring: "ring-violet-300", bg: "bg-violet-50", text: "text-violet-900" },
  rag_partial: { ring: "ring-indigo-300", bg: "bg-indigo-50", text: "text-indigo-900" },
  rag_done: { ring: "ring-green-300", bg: "bg-green-50", text: "text-green-900" },
  failed: { ring: "ring-red-300", bg: "bg-red-50", text: "text-red-800" },
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function StepBadge({ step }: { step: EffectiveIngestStep }) {
  const style = STEP_CARD_STYLE[step]
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      {EFFECTIVE_STEP_LABELS[step]}
    </span>
  )
}

export default function IngestPipelinePanel() {
  const [userId, setUserId] = useState<string | null>(null)
  const [status, setStatus] = useState<IngestStatusDetails | null>(null)
  const [filterStep, setFilterStep] = useState<EffectiveIngestStep | null>(null)
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchStats, setBatchStats] = useState<{
    ok: number
    failed: number
    rounds: number
  } | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const stopBatchRef = useRef(false)

  const loadStatus = useCallback(
    async (uid: string, step: EffectiveIngestStep | null, off: number) => {
      const details = await fetchIngestStatus(uid, {
        step: step ?? undefined,
        limit: PAGE_SIZE,
        offset: off,
      })
      setStatus(details)
      return details
    },
    []
  )

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    void loadStatus(userId, filterStep, offset)
  }, [userId, filterStep, offset, loadStatus])

  useEffect(() => {
    if (!userId || !batchRunning) return
    const id = setInterval(() => {
      void loadStatus(userId, filterStep, offset)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [userId, batchRunning, filterStep, offset, loadStatus])

  async function handleRunBatch() {
    if (!userId || batchRunning) return
    stopBatchRef.current = false
    setBatchRunning(true)
    const stats = { ok: 0, failed: 0, rounds: 0 }
    setBatchStats(stats)
    setStatusMsg("Iniciando lote na VPS…")

    try {
      do {
        if (stopBatchRef.current) break

        const before = await loadStatus(userId, filterStep, offset)
        const remaining = workRemainingFromSummary(before.summary)
        if (remaining === 0) {
          setStatusMsg("Pipeline concluído — todos com RAG ou sem pendências.")
          break
        }

        setStatusMsg(
          `Lote na VPS… ~${remaining} pendente(s) · rodada ${stats.rounds + 1}`
        )

        const result = await runIngestBatchOnVps(userId, {
          maxDocuments: 20,
          maxSeconds: 540,
          step: filterStep ?? undefined,
        })

        stats.ok += result.ok
        stats.failed += result.failed
        stats.rounds++
        setBatchStats({ ...stats })

        await loadStatus(userId, filterStep, offset)

        if (result.stopped_reason === "idle") break
        if (result.stopped_reason === "busy") {
          await sleep(5000)
          continue
        }
        if (result.stopped_reason === "cancelled") break
      } while (!stopBatchRef.current)
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Erro no lote")
    } finally {
      setBatchRunning(false)
      setBatchStats(null)
      if (userId) await loadStatus(userId, filterStep, offset)
    }
  }

  async function handleStopBatch() {
    stopBatchRef.current = true
    if (userId) await cancelIngestBatchOnVps(userId)
    setStatusMsg("Parando lote…")
  }

  async function handleReindex(documentId: string) {
    if (!userId || batchRunning) return
    try {
      await reindexDocumentInQueue(userId, documentId)
      await loadStatus(userId, filterStep, offset)
      setStatusMsg("Documento recolocado na fila.")
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Erro")
    }
  }

  if (!status || status.total === 0) return null

  const remaining = workRemainingFromSummary(status.summary)
  const ragDone = status.summary.rag_done
  const ragPct =
    status.total > 0 ? Math.round((ragDone / status.total) * 100) : 0

  const listTotal = filterStep ? status.filtered_total : status.total

  return (
    <section className="mb-6 rounded-xl border border-slate-300 bg-slate-50/80 p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Pipeline de indexação (RAG)
          </h3>
          <p className="text-xs text-slate-600">
            RAG completo: {ragDone}/{status.total} ({ragPct}%) · {remaining}{" "}
            pendente(s)
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-slate-600" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-600" />
        )}
      </button>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!userId || batchRunning || remaining === 0}
          onClick={() => void handleRunBatch()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {batchRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          Completar até RAG (VPS)
        </button>
        <button
          type="button"
          disabled={!userId || !batchRunning}
          onClick={() => void handleStopBatch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
        >
          Parar lote
        </button>
        <button
          type="button"
          disabled={!userId || batchRunning}
          onClick={() => userId && void loadStatus(userId, filterStep, offset)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>

      {batchRunning && batchStats && (
        <p className="mt-2 text-xs text-emerald-900">
          Lote rodando · {batchStats.ok} ok · {batchStats.failed} erros ·{" "}
          {batchStats.rounds} rodada(s)
        </p>
      )}
      {statusMsg && (
        <p className="mt-2 text-xs text-slate-600">{statusMsg}</p>
      )}

      {expanded && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {STEP_CARD_ORDER.map((step) => {
              const count = status.summary[step]
              const style = STEP_CARD_STYLE[step]
              const active = filterStep === step
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => {
                    setOffset(0)
                    setFilterStep((prev) => (prev === step ? null : step))
                  }}
                  className={`rounded-lg border p-2 text-left ring-1 ${style.ring} ${style.bg} ${
                    active ? "outline outline-2 outline-offset-1 outline-slate-500" : ""
                  }`}
                >
                  <p className={`text-lg font-semibold ${style.text}`}>{count}</p>
                  <p className="text-[10px] leading-tight text-slate-600">
                    {EFFECTIVE_STEP_LABELS[step]}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-green-600 transition-all duration-500"
              style={{ width: `${ragPct}%` }}
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 font-medium">Matéria</th>
                  <th className="px-3 py-2 font-medium">Etapa</th>
                  <th className="px-3 py-2 font-medium">Trechos</th>
                  <th className="px-3 py-2 font-medium">Vetores</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {status.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50">
                    <td className="max-w-[200px] truncate px-3 py-2 font-medium text-slate-900">
                      {item.title}
                      {item.ingest_error && (
                        <p className="truncate font-normal text-red-600">
                          {item.ingest_error}
                        </p>
                      )}
                    </td>
                    <td className="truncate px-3 py-2 text-slate-600">
                      {item.subject_name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StepBadge step={item.effective_step} />
                      {item.has_source_text && item.effective_step !== "rag_done" && (
                        <span className="ml-1 text-[10px] text-slate-500">· texto</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{item.chunks_db}</td>
                    <td className="px-3 py-2 text-slate-600">{item.embedded_db}</td>
                    <td className="px-3 py-2">
                      {(item.effective_step === "failed" ||
                        item.effective_step === "needs_parse") && (
                        <button
                          type="button"
                          title="Tentar de novo"
                          disabled={batchRunning}
                          onClick={() => void handleReindex(item.id)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!status.items.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-500">
                      Nenhum documento neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={offset === 0 || batchRunning}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              className="text-xs font-medium text-slate-700 underline disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">
              {offset + 1}–{offset + status.items.length} de {listTotal}
              {filterStep ? ` (${EFFECTIVE_STEP_LABELS[filterStep]})` : ""}
            </span>
            <button
              type="button"
              disabled={!status.has_more || batchRunning}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              className="text-xs font-medium text-slate-700 underline disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </>
      )}
    </section>
  )
}
