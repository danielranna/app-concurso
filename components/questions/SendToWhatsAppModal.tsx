"use client"

import { useEffect, useState } from "react"
import { MessageCircle } from "lucide-react"

type Props = {
  open: boolean
  onClose: () => void
  userId: string
  notebookId: string
  notebookName: string
  onSent?: () => void
}

export default function SendToWhatsAppModal({
  open,
  onClose,
  userId,
  notebookId,
  notebookName,
  onSent,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [already, setAlready] = useState<{ caderno_id: number | null } | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const syncRes = await fetch(`/api/notebooks/${notebookId}/quiz-sync?user_id=${userId}`)
      const sync = await syncRes.json().catch(() => ({}))
      if (cancelled) return
      if (sync.enabled) setAlready({ caderno_id: sync.caderno_id ?? null })
      else setAlready(null)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, notebookId, userId])

  if (!open) return null

  async function send() {
    setSending(true)
    setError(null)
    const res = await fetch(`/api/notebooks/${notebookId}/send-to-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: notebookName,
        activate: false,
        deliveryMode: "group",
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) {
      setError(data.error || "Falha ao enviar")
      return
    }
    onSent?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-emerald-700" />
          <h2 className="text-lg font-semibold text-slate-900">Enviar ao WhatsApp</h2>
        </div>
        {loading ? (
          <p className="text-sm text-slate-600">Carregando…</p>
        ) : already ? (
          <p className="text-sm text-slate-700">
            Este caderno já está no Papa Vagas
            {already.caderno_id ? ` (caderno #${already.caderno_id})` : ""}. As respostas
            continuam sincronizando por questão.
          </p>
        ) : (
          <div className="space-y-3 text-sm text-slate-800">
            <p>
              Envia as questões para o Papa Vagas como caderno <strong>inativo</strong>. Ritmo,
              engajados e ativação você configura lá, como nos cadernos criados no site.
            </p>
            <p className="text-xs text-slate-500">
              Depois de ativo, as respostas voltam para cá (letra, confiança, duração e
              anotação).
            </p>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 hover:bg-slate-50"
          >
            Fechar
          </button>
          {!already && (
            <button
              type="button"
              disabled={sending || loading}
              onClick={send}
              className="rounded-lg bg-emerald-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {sending ? "Enviando…" : "Enviar"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
