"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  fetchIngestQueueDetails,
  ingestStageLabel,
  type IngestQueueDetails,
} from "@/lib/coach-ingest-worker-client"

const POLL_MS = 3_000
const LIST_LIMIT = 5

function QueueRow({
  item,
  variant,
}: {
  item: {
    title: string
    subject_name: string | null
    ingest_stage: string
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
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
          variant === "current"
            ? "bg-amber-200 text-amber-950"
            : variant === "next"
              ? "bg-amber-100 text-amber-900"
              : "bg-slate-100 text-slate-600"
        }`}
      >
        {variant === "current" && (
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
        )}
        {badge}
      </span>
    </li>
  )
}

export default function IngestQueuePanel() {
  const [userId, setUserId] = useState<string | null>(null)
  const [queue, setQueue] = useState<IngestQueueDetails | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async (uid: string, limit: number) => {
    const details = await fetchIngestQueueDetails(uid, limit)
    setQueue(details)
    if (!details.active) setShowAll(false)
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
    void load(userId, limit)
    const t = setInterval(() => void load(userId, limit), POLL_MS)
    return () => clearInterval(t)
  }, [userId, load, showAll])

  if (!queue?.active || queue.total === 0) return null

  const progressPct =
    queue.total > 0 ? Math.round((queue.completed / queue.total) * 100) : 0

  const waitingItems = queue.items.filter(
    (i) => !i.is_current && !i.is_next
  )

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
            Um arquivo por vez · todas as matérias
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
        </ul>
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
