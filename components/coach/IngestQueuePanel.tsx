"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  fetchIngestQueueDetails,
  ingestStageLabel,
  tickSerialIngestWorker,
  type IngestQueueDetails,
} from "@/lib/coach-ingest-worker-client"

const POLL_UI_MS = 5_000
const WORKER_GAP_MS = 8_000
const LIST_LIMIT = 5

function QueueRow({
  item,
  variant,
}: {
  item: {
    title: string
    subject_name: string | null
    ingest_stage: string
    ingest_error?: string | null
    page_count?: number | null
    is_current?: boolean
    is_next?: boolean
  }
  variant: "current" | "next" | "waiting"
}) {
  const badge =
    variant === "current"
      ? "Agora"
      : variant === "next"
        ? "Próximo"
        : ingestStageLabel(item.ingest_stage)

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
      <span
        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          variant === "current"
            ? "bg-amber-200 text-amber-950"
            : variant === "next"
              ? "bg-amber-100 text-amber-900"
              : "bg-slate-100 text-slate-600"
        }`}
      >
        {variant === "current" && (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        )}
        {badge}
      </span>
    </li>
  )
}

/**
 * Único coordenador: mostra fila (GET leve) + processa 1 job por vez (POST).
 * Evita dois componentes chamando run-ingest em paralelo.
 */
export default function IngestQueuePanel() {
  const [userId, setUserId] = useState<string | null>(null)
  const [queue, setQueue] = useState<IngestQueueDetails | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const workerBusyRef = useRef(false)
  const lastWorkerAtRef = useRef(0)

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
    const limit = showAll ? 50 : LIST_LIMIT

    const runCycle = async () => {
      const details = await loadQueue(userId, limit)
      if (!details.active) return

      const now = Date.now()
      if (workerBusyRef.current) return
      if (now - lastWorkerAtRef.current < WORKER_GAP_MS) return
      if (details.running) return

      workerBusyRef.current = true
      lastWorkerAtRef.current = now
      try {
        const result = await tickSerialIngestWorker(userId)
        if (result.queue) setQueue(result.queue)
        else await loadQueue(userId, limit)
      } catch {
        /* UI atualiza no próximo ciclo */
      } finally {
        workerBusyRef.current = false
      }
    }

    void runCycle()
    const t = setInterval(() => void runCycle(), POLL_UI_MS)
    return () => clearInterval(t)
  }, [userId, loadQueue, showAll])

  const showPanel =
    queue &&
    (queue.active || queue.running || queue.pending_count > 0 || queue.total > 0)

  if (!showPanel) return null

  const progressPct =
    queue.total > 0 ? Math.round((queue.completed / queue.total) * 100) : 0

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
            Um PDF por vez até ficar pronto (ler → indexar → vetorizar) · depois o próximo
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-amber-800" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-amber-800" />
        )}
      </button>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-amber-950">
          <span>
            {queue.completed}/{queue.total} indexados
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

      {expanded && (
        <ul className="mt-4 space-y-2">
          {queue.current && (
            <QueueRow item={queue.current} variant="current" />
          )}
          {queue.next && queue.next.id !== queue.current?.id && (
            <QueueRow item={queue.next} variant="next" />
          )}
          {waitingItems.map((item) => (
            <QueueRow key={item.id} item={item} variant="waiting" />
          ))}
          {!queue.items.length && queue.pending_count > 0 && (
            <li className="rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs text-slate-600">
              {queue.pending_count} arquivo(s) aguardando na fila…
            </li>
          )}
        </ul>
      )}

      {expanded && queue.failed_count > 0 && (
        <div className="mt-4 border-t border-red-200/80 pt-3">
          <p className="mb-2 text-xs font-semibold text-red-800">
            Erros ({queue.failed_count}) — pulados; use Reindexar na matéria
          </p>
          <ul className="space-y-2">
            {queue.failed_items.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-red-100 bg-red-50/80 px-3 py-2"
              >
                <p className="truncate text-sm font-medium text-slate-900">
                  {item.title}
                </p>
                <p className="truncate text-xs text-red-700">
                  {item.subject_name ? `${item.subject_name} · ` : ""}
                  {item.ingest_error ?? "Falha na indexação"}
                </p>
              </li>
            ))}
          </ul>
          {queue.failed_count > queue.failed_items.length && (
            <p className="mt-2 text-xs text-red-700">
              +{queue.failed_count - queue.failed_items.length} outros com erro
            </p>
          )}
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

      {!expanded && queue.current && (
        <p className="mt-2 truncate text-xs text-amber-900">
          Agora: <span className="font-medium">{queue.current.title}</span>
          {queue.next ? (
            <>
              {" "}
              · Próximo: <span className="font-medium">{queue.next.title}</span>
            </>
          ) : null}
        </p>
      )}
    </section>
  )
}
