"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  RefreshCw,
  SkipForward,
  RotateCcw,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  chunkWorkRemaining,
  deferDocumentInQueue,
  embedWorkRemaining,
  fetchIngestQueueDetails,
  ingestStageLabel,
  ingestWorkRemaining,
  processNextIngest,
  queueRag,
  reindexDocumentInQueue,
  type IngestProcessMode,
  type IngestQueueDetails,
} from "@/lib/coach-ingest-worker-client"

const LIST_LIMIT = 5
const RETRY_BUSY_MS = 4000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function QueueRow({
  item,
  variant,
  actions,
}: {
  item: {
    id: string
    title: string
    subject_name: string | null
    ingest_stage: string
    ingest_error?: string | null
    page_count?: number | null
  }
  variant: "current" | "next" | "waiting" | "failed"
  actions?: React.ReactNode
}) {
  const badge =
    variant === "current"
      ? "Processando"
      : variant === "next"
        ? "Próximo"
        : variant === "failed"
          ? "Erro"
          : "Aguardando"

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-white px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
        <p className="truncate text-xs text-slate-500">
          {item.subject_name ? `${item.subject_name} · ` : ""}
          {ingestStageLabel(item.ingest_stage)}
          {item.page_count ? ` · ${item.page_count} pág.` : ""}
        </p>
        {item.ingest_error && (
          <p className="mt-0.5 truncate text-xs text-red-600">{item.ingest_error}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            variant === "current"
              ? "bg-amber-200 text-amber-950"
              : variant === "next"
                ? "bg-amber-100 text-amber-900"
                : variant === "failed"
                  ? "bg-red-100 text-red-800"
                  : "bg-slate-100 text-slate-600"
          }`}
        >
          {variant === "current" && (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          )}
          {badge}
        </span>
      </div>
    </li>
  )
}

export default function IngestQueuePanel() {
  const [userId, setUserId] = useState<string | null>(null)
  const [queue, setQueue] = useState<IngestQueueDetails | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [processingTitle, setProcessingTitle] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [loopStats, setLoopStats] = useState<{
    done: number
    ok: number
    failed: number
  } | null>(null)
  const stopLoopRef = useRef(false)

  const loadQueue = useCallback(async (uid: string, limit: number) => {
    const details = await fetchIngestQueueDetails(uid, limit)
    setQueue(details)
    if (!details.active) setShowAll(false)
    return details
  }, [])

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
    void loadQueue(userId, LIST_LIMIT)
  }, [userId, loadQueue])

  const runLoop = useCallback(
    async (
      uid: string,
      options: {
        processAll: boolean
        random?: boolean
        mode?: IngestProcessMode
      }
    ) => {
      const embedOnly = options.mode === "embed_only"
      const chunkBackfill = options.mode === "chunk_backfill"
      stopLoopRef.current = false
      setProcessing(true)
      setStatusMsg(null)
      const stats = { done: 0, ok: 0, failed: 0 }
      setLoopStats(options.processAll ? stats : null)

      try {
        do {
          if (stopLoopRef.current) break

          const limit = showAll ? 50 : LIST_LIMIT
          const before = await loadQueue(uid, limit)
          const remainingBefore = embedOnly
            ? embedWorkRemaining(before)
            : chunkBackfill
              ? chunkWorkRemaining(before)
              : ingestWorkRemaining(before)
          if (remainingBefore === 0) {
            setStatusMsg(
              options.processAll
                ? embedOnly
                  ? `Vetorização concluída (${stats.ok} com RAG completo).`
                  : chunkBackfill
                    ? `Trechos gerados (${stats.ok} indexados, ${stats.failed} com erro).`
                    : `Fila concluída (${stats.ok} prontos, ${stats.failed} com erro).`
                : embedOnly
                  ? "Nenhum PDF pendente de vetorização."
                  : chunkBackfill
                    ? "Nenhum PDF pronto sem trechos."
                    : "Nada pendente na fila."
            )
            break
          }

          const nextTitle =
            before.next?.title ??
            before.failed_items[0]?.title ??
            before.current?.title ??
            "PDF"
          setProcessingTitle(nextTitle)

          if (options.processAll) {
            setStatusMsg(
              embedOnly
                ? `Vetorizando… ${stats.done + 1} feito(s) · ~${remainingBefore} sem vetor completo`
                : chunkBackfill
                  ? `Gerando trechos… ${stats.done + 1} feito(s) · ~${remainingBefore} sem chunks`
                  : `Processando… ${stats.done + 1} concluído(s) · ~${remainingBefore} restante(s) (fila + erros)`
            )
          }

          const result = await processNextIngest(uid, {
            random: options.random,
            includeFailed:
              options.processAll && !embedOnly && !chunkBackfill,
            mode: options.mode ?? "full",
          })
          setQueue(result.queue)

          if (result.status === "ready") {
            stats.ok++
            stats.done++
            const emb =
              result.embedded != null && result.chunks != null
                ? ` · ${result.embedded}/${result.chunks} vetores`
                : ""
            setStatusMsg(
              options.processAll
                ? `Pronto: ${result.title ?? "arquivo"}${emb} (${stats.ok}/${stats.done})`
                : `Pronto: ${result.title ?? "arquivo"}${emb}`
            )
          } else if (result.status === "failed") {
            stats.failed++
            stats.done++
            setStatusMsg(
              options.processAll
                ? `Erro: ${result.title ?? "arquivo"} — seguindo… (${stats.failed} erro(s))`
                : `Erro em ${result.title ?? "arquivo"}`
            )
          } else if (result.status === "idle") {
            setStatusMsg(
              options.processAll
                ? `Fila concluída (${stats.ok} prontos, ${stats.failed} com erro).`
                : "Fila concluída."
            )
            break
          } else if (result.status === "retry") {
            setStatusMsg(result.error ?? "Aguarde… tentando de novo.")
            if (options.processAll) {
              await sleep(RETRY_BUSY_MS)
              continue
            }
            break
          }

          if (options.processAll) {
            setLoopStats({ ...stats })
          }

          if (!options.processAll) break
          const left = embedOnly
            ? embedWorkRemaining(result.queue)
            : chunkBackfill
              ? chunkWorkRemaining(result.queue)
              : ingestWorkRemaining(result.queue)
          if (left === 0) {
            setStatusMsg(
              embedOnly
                ? `Vetorização concluída (${stats.ok} com RAG completo).`
                : chunkBackfill
                  ? `Trechos gerados (${stats.ok} indexados, ${stats.failed} com erro).`
                  : `Fila concluída (${stats.ok} prontos, ${stats.failed} com erro).`
            )
            break
          }
        } while (options.processAll)
      } catch (e) {
        const err = e instanceof Error ? e.message : "Erro ao processar"
        setStatusMsg(
          `${err} — o PDF pode ter ficado preso; clique Atualizar lista e processe o próximo (ou use ↷ para pular).`
        )
        if (userId) await loadQueue(userId, showAll ? 50 : LIST_LIMIT)
      } finally {
        setProcessing(false)
        setProcessingTitle(null)
        setLoopStats(null)
        await loadQueue(uid, showAll ? 50 : LIST_LIMIT)
      }
    },
    [loadQueue, showAll]
  )

  async function handleDefer(documentId: string) {
    if (!userId || processing) return
    try {
      await deferDocumentInQueue(userId, documentId)
      await loadQueue(userId, showAll ? 50 : LIST_LIMIT)
      setStatusMsg("Arquivo enviado para o fim da fila.")
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Erro")
    }
  }

  async function handleReindex(documentId: string) {
    if (!userId || processing) return
    try {
      await reindexDocumentInQueue(userId, documentId)
      await loadQueue(userId, showAll ? 50 : LIST_LIMIT)
      setStatusMsg("Voltou para a fila. Use Processar próximo.")
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Erro")
    }
  }

  const rag = queue ? queueRag(queue) : null

  const showPanel =
    queue &&
    (queue.active ||
      queue.pending_count > 0 ||
      queue.total > 0 ||
      queue.failed_count > 0 ||
      (rag?.need_embed ?? 0) > 0 ||
      (rag?.need_chunk ?? 0) > 0)

  if (!showPanel || !queue || !rag) return null

  const progressPct =
    queue.total > 0 ? Math.round((queue.completed / queue.total) * 100) : 0
  const ragPct =
    rag.total_with_chunks > 0
      ? Math.round((rag.complete / rag.total_with_chunks) * 100)
      : 0

  const waitingItems = queue.items.filter((i) => !i.is_current && !i.is_next)

  return (
    <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50/50 p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-amber-950">
            Fila de indexação (global)
          </h3>
          <p className="text-xs text-amber-900/80">
            VPS · 1 PDF por vez · use &quot;Gerar trechos em fila&quot; para PDFs prontos
            sem chunks (~{rag.need_chunk})
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-amber-800" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-amber-800" />
        )}
      </button>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!userId || processing || queue.pending_count === 0}
          onClick={() => userId && void runLoop(userId, { processAll: false })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {processing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Processar próximo
        </button>
        <button
          type="button"
          disabled={
            !userId ||
            processing ||
            ingestWorkRemaining(queue) === 0
          }
          onClick={() => userId && void runLoop(userId, { processAll: true })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
        >
          Processar todos
        </button>
        <button
          type="button"
          disabled={!userId || processing || rag.need_chunk === 0}
          onClick={() =>
            userId &&
            void runLoop(userId, { processAll: true, mode: "chunk_backfill" })
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
        >
          Gerar trechos em fila
        </button>
        <button
          type="button"
          disabled={!userId || processing || rag.need_embed === 0}
          onClick={() =>
            userId &&
            void runLoop(userId, { processAll: true, mode: "embed_only" })
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
        >
          Vetorizar pendentes (RAG)
        </button>
        <button
          type="button"
          disabled={!userId || processing}
          onClick={() => {
            stopLoopRef.current = true
            userId && void loadQueue(userId, showAll ? 50 : LIST_LIMIT)
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar lista
        </button>
        {processing && (
          <button
            type="button"
            onClick={() => {
              stopLoopRef.current = true
            }}
            className="text-xs font-medium text-red-700 underline"
          >
            Parar
          </button>
        )}
      </div>

      {processing && processingTitle && (
        <p className="mt-2 text-xs text-amber-900">
          Processando: <span className="font-medium">{processingTitle}</span>…
          {loopStats && (
            <span className="text-amber-800/90">
              {" "}
              · {loopStats.ok} prontos, {loopStats.failed} erro(s)
            </span>
          )}
        </p>
      )}
      {statusMsg && !processing && (
        <p className="mt-2 text-xs text-slate-600">{statusMsg}</p>
      )}

      <div className="mt-3 space-y-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-amber-950">
            <span>
              Texto: {queue.completed}/{queue.total}
              {queue.pending_count > 0 ? ` · ${queue.pending_count} na fila` : ""}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-amber-200/80">
            <div
              className="h-full rounded-full bg-amber-600 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-violet-950">
            <span>
              RAG: {rag.complete}/{rag.total_with_chunks} com vetores
              {rag.need_chunk > 0 ? ` · ${rag.need_chunk} sem trechos` : ""}
              {rag.need_embed > 0 ? ` · ${rag.need_embed} faltam vetor` : ""}
            </span>
            <span>{ragPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-violet-200/80">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-500"
              style={{ width: `${ragPct}%` }}
            />
          </div>
        </div>
      </div>

      {expanded && (
        <ul className="mt-4 space-y-2">
          {queue.next && (
            <QueueRow
              item={{ ...queue.next, ingest_stage: "uploaded" }}
              variant="next"
              actions={
                <button
                  type="button"
                  title="Enviar para o fim da fila"
                  disabled={processing}
                  onClick={() => void handleDefer(queue.next!.id)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              }
            />
          )}
          {waitingItems.map((item) => (
            <QueueRow
              key={item.id}
              item={{ ...item, ingest_stage: "uploaded" }}
              variant="waiting"
              actions={
                <button
                  type="button"
                  title="Enviar para o fim da fila"
                  disabled={processing}
                  onClick={() => void handleDefer(item.id)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              }
            />
          ))}
          {!queue.next && !waitingItems.length && queue.pending_count > 0 && (
            <li className="rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs text-slate-600">
              {queue.pending_count} na fila — clique em Processar próximo
            </li>
          )}
        </ul>
      )}

      {expanded && queue.failed_count > 0 && (
        <div className="mt-4 border-t border-red-200/80 pt-3">
          <p className="mb-2 text-xs font-semibold text-red-800">
            Erros ({queue.failed_count})
          </p>
          <ul className="space-y-2">
            {queue.failed_items.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                variant="failed"
                actions={
                  <button
                    type="button"
                    title="Tentar de novo"
                    disabled={processing}
                    onClick={() => void handleReindex(item.id)}
                    className="rounded p-1 text-red-600 hover:bg-red-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                }
              />
            ))}
          </ul>
        </div>
      )}

      {expanded && (queue.has_more || showAll) && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs font-medium text-amber-900 underline hover:text-amber-950"
        >
          {showAll
            ? "Mostrar menos"
            : `Mostrar mais (${Math.max(0, queue.pending_count - LIST_LIMIT)} na fila)`}
        </button>
      )}
    </section>
  )
}
