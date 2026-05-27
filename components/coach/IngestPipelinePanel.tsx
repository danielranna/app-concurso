"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  cancelIngestBatchOnVps,
  EFFECTIVE_STEP_LABELS,
  fetchIngestStatus,
  runIngestBatchOnVps,
  workRemainingFromSummary,
  type EffectiveIngestStep,
  type IngestStatusDetails,
} from "@/lib/coach-ingest-worker-client"

const POLL_MS = 12_000

type UiRunState = "idle" | "running" | "stopping" | "completed" | "error"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function IngestPipelinePanel() {
  const [userId, setUserId] = useState<string | null>(null)
  const [status, setStatus] = useState<IngestStatusDetails | null>(null)
  const [runState, setRunState] = useState<UiRunState>("idle")
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const stopBatchRef = useRef(false)

  const loadStatus = useCallback(async (uid: string) => {
    const details = await fetchIngestStatus(uid, { limit: 5, offset: 0 })
    setStatus(details)
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
    void loadStatus(userId)
  }, [userId, loadStatus])

  useEffect(() => {
    if (!userId || runState !== "running") return
    const id = setInterval(() => {
      void loadStatus(userId)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [userId, runState, loadStatus])

  async function handleStart() {
    if (!userId || runState === "running" || runState === "stopping") return
    stopBatchRef.current = false
    setRunState("running")
    setStatusMsg("Indexação iniciada.")

    try {
      while (!stopBatchRef.current) {
        const before = await loadStatus(userId)
        const remaining = workRemainingFromSummary(before.summary)
        if (remaining === 0) {
          setRunState("completed")
          setStatusMsg("Concluído: todos os arquivos processados até RAG.")
          break
        }

        const result = await runIngestBatchOnVps(userId, {
          maxDocuments: 20,
          maxSeconds: 540,
        })
        await loadStatus(userId)

        if (result.stopped_reason === "idle") {
          setRunState("completed")
          setStatusMsg("Concluído: fila finalizada.")
          break
        }
        if (result.stopped_reason === "cancelled") {
          setRunState("idle")
          setStatusMsg("Parado pelo usuário.")
          break
        }
        if (result.stopped_reason === "busy") {
          setStatusMsg("Já existe um lote em execução. Aguardando...")
          await sleep(5000)
        } else {
          setStatusMsg("Lote executado. Continuando automaticamente...")
        }
      }
    } catch (e) {
      setRunState("error")
      setStatusMsg(e instanceof Error ? e.message : "Erro na indexação.")
    } finally {
      if (!stopBatchRef.current) {
        setRunState("idle")
      }
      if (userId) await loadStatus(userId)
    }
  }

  async function handleStop() {
    if (!userId || runState !== "running") return
    stopBatchRef.current = true
    setRunState("stopping")
    setStatusMsg("Solicitando parada...")
    await cancelIngestBatchOnVps(userId)
    await loadStatus(userId)
    setRunState("idle")
    setStatusMsg("Parado.")
  }

  if (!status || status.total === 0) return null

  const ragDone = status.summary.rag_done
  const remaining = workRemainingFromSummary(status.summary)
  const ragPct = status.total > 0 ? Math.round((ragDone / status.total) * 100) : 0

  const currentItem =
    status.current_item ??
    status.items.find((i) => i.effective_step !== "rag_done") ??
    null

  const statusLabel =
    runState === "running"
      ? "Rodando"
      : runState === "stopping"
        ? "Parando"
        : runState === "completed"
          ? "Concluído"
          : runState === "error"
            ? "Com erro"
            : "Parado"

  const currentStepLabel = currentItem
    ? EFFECTIVE_STEP_LABELS[currentItem.effective_step as EffectiveIngestStep]
    : "Sem pendências"

  return (
    <section className="mb-6 rounded-xl border border-slate-300 bg-slate-50/80 p-4">
      <h3 className="text-sm font-semibold text-slate-900">
        Pipeline de indexação (modo simples)
      </h3>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!userId || runState === "running" || runState === "stopping" || remaining === 0}
          onClick={() => void handleStart()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {runState === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          Iniciar indexação
        </button>
        <button
          type="button"
          disabled={!userId || runState !== "running"}
          onClick={() => void handleStop()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
        >
          Parar
        </button>
      </div>

      <div className="mt-3 space-y-1 text-xs text-slate-700">
        <p>
          Progresso: <span className="font-medium">{ragDone}</span> / {status.total} com
          RAG completo ({ragPct}%)
        </p>
        <p>
          Status: <span className="font-medium">{statusLabel}</span>
        </p>
        <p>
          Arquivo atual:{" "}
          <span className="font-medium">{currentItem?.title ?? "—"}</span> · etapa:{" "}
          <span className="font-medium">{currentStepLabel}</span>
        </p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-green-600 transition-all duration-500"
          style={{ width: `${ragPct}%` }}
        />
      </div>

      {statusMsg ? <p className="mt-2 text-xs text-slate-600">{statusMsg}</p> : null}

      <button
        type="button"
        onClick={() => setDetailsOpen((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-700 underline"
      >
        {detailsOpen ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        Ver detalhes
      </button>

      {detailsOpen ? (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
          <div>
            <p className="font-semibold text-slate-800">Etapas (resumo)</p>
            <p className="mt-1 text-slate-600">
              Na fila: {status.summary.queued} · Sem texto: {status.summary.needs_parse} ·
              Sem trechos: {status.summary.needs_chunk} · Sem vetor:{" "}
              {status.summary.needs_embed} · Parcial: {status.summary.rag_partial} ·
              Processando: {status.summary.processing} · Erros: {status.summary.failed}
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-800">Erros recentes</p>
            {status.recent_errors.length ? (
              <ul className="mt-1 space-y-1 text-slate-600">
                {status.recent_errors.map((item) => (
                  <li key={item.id}>
                    {item.title} — {item.ingest_error}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-slate-500">Sem erros recentes.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
