"use client"

import { useCallback, useEffect, useState } from "react"

type EventRow = {
  id: string
  direction: "in" | "out"
  kind: string
  ok: boolean | null
  http_status: number | null
  pending: boolean | null
  reason: string | null
  caderno_id: number | null
  tec_id: number | null
  user_jid: string | null
  payload: unknown
  created_at: string
}

const KIND_LABEL: Record<string, string> = {
  flush: "Publicação (não é resposta)",
  answer: "Resposta do WhatsApp",
  send: "Envio do caderno",
  ingest: "Resposta do app → WhatsApp",
  unlink: "Desvincular caderno",
  status: "Status",
}

function kindLabel(kind: string) {
  return KIND_LABEL[kind] || kind
}

export default function QuizSyncWebhooksPanel({ userId }: { userId: string }) {
  const [events, setEvents] = useState<EventRow[]>([])
  const [direction, setDirection] = useState<"all" | "in" | "out">("all")
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const params = new URLSearchParams({ user_id: userId, limit: "80" })
    if (direction !== "all") params.set("direction", direction)
    const res = await fetch(`/api/quiz-sync/events?${params}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || "Falha ao carregar logs")
      return
    }
    setEvents(data.events ?? [])
  }, [userId, direction])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 8000)
    return () => clearInterval(t)
  }, [load])

  async function copyJson(row: EventRow) {
    await navigator.clipboard.writeText(JSON.stringify(row, null, 2))
    setCopied(row.id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="max-w-3xl">
      <p className="mb-3 text-sm text-slate-600">
        Diagnóstico temporário: o que chega do Papa Vagas/WhatsApp e o que este app envia. Atualiza
        sozinho a cada 8s. <strong>flush</strong> = questão publicada no WhatsApp (empurra
        respostas já feitas neste app). <strong>answer</strong> = você respondeu no WhatsApp/omissas
        e o progresso deve aparecer no caderno.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "in", "out"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              direction === d ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {d === "all" ? "Todos" : d === "in" ? "Entrada" : "Saída"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Atualizar
        </button>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {events.length === 0 && (
        <p className="text-sm text-slate-500">Nenhum evento ainda. Envie o caderno ou responda no WhatsApp.</p>
      )}
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-slate-900">
                {e.direction === "in" ? "← in" : "→ out"} · {kindLabel(e.kind)}
                {e.ok === false ? " · falhou" : e.pending ? " · pending" : e.ok ? " · ok" : ""}
              </p>
              <span className="text-xs text-slate-500">
                {new Date(e.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {e.http_status != null ? `HTTP ${e.http_status}` : ""}
              {e.caderno_id != null ? ` · caderno #${e.caderno_id}` : ""}
              {e.tec_id != null ? ` · tec ${e.tec_id}` : ""}
              {e.user_jid ? ` · ${e.user_jid}` : ""}
              {e.reason ? ` · ${e.reason}` : ""}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setOpenId(openId === e.id ? null : e.id)}
                className="text-xs text-slate-700 underline"
              >
                {openId === e.id ? "Ocultar JSON" : "Ver JSON"}
              </button>
              <button
                type="button"
                onClick={() => void copyJson(e)}
                className="text-xs text-slate-700 underline"
              >
                {copied === e.id ? "Copiado" : "Copiar"}
              </button>
            </div>
            {openId === e.id && (
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-800">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
