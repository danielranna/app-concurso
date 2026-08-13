"use client"

import { useEffect, useState } from "react"
import { MessageCircle } from "lucide-react"

type WaUser = { userJid: string; displayLabel: string; engaged?: boolean }

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
  const [jid, setJid] = useState<string | null>(null)
  const [users, setUsers] = useState<WaUser[]>([])
  const [deliveryMode, setDeliveryMode] = useState<"group" | "private">("group")
  const [activate, setActivate] = useState(true)
  const [questionsPerDay, setQuestionsPerDay] = useState(3)
  const [startHour, setStartHour] = useState(7)
  const [recipients, setRecipients] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const [syncRes, usersRes, botRes] = await Promise.all([
        fetch(`/api/notebooks/${notebookId}/quiz-sync?user_id=${userId}`),
        fetch(`/api/flashcards/whatsapp-users?user_id=${userId}`),
        fetch(`/api/flashcards/bot/settings/web?user_id=${userId}`),
      ])
      const sync = await syncRes.json().catch(() => ({}))
      const usersJson = await usersRes.json().catch(() => ({}))
      const bot = await botRes.json().catch(() => ({}))
      if (cancelled) return
      if (sync.enabled) setAlready({ caderno_id: sync.caderno_id ?? null })
      else setAlready(null)
      setJid(bot.whatsapp_jid && bot.whatsapp_authorized ? bot.whatsapp_jid : sync.jid ?? null)
      setUsers(Array.isArray(usersJson.users) ? usersJson.users : [])
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
    const privateRecipients =
      deliveryMode === "private"
        ? users
            .filter((u) => recipients[u.userJid])
            .map((u) => ({ userJid: u.userJid, active: true }))
        : []
    if (deliveryMode === "private" && privateRecipients.length === 0 && !jid) {
      setError("Marque ao menos um destinatário ou vincule seu WhatsApp em Flashcards.")
      setSending(false)
      return
    }
    const res = await fetch(`/api/notebooks/${notebookId}/send-to-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: notebookName,
        activate,
        deliveryMode,
        createdByJid: jid,
        privateRecipients,
        schedule: { questionsPerDay, startHour, startMinute: 0 },
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
            {!jid && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                Vincule o WhatsApp em Flashcards → Configurações para receber no privado e
                sincronizar respostas.
              </p>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={activate}
                onChange={(e) => setActivate(e.target.checked)}
              />
              Ativar envio agora
            </label>
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={deliveryMode === "group"}
                  onChange={() => setDeliveryMode("group")}
                />
                Grupo
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={deliveryMode === "private"}
                  onChange={() => setDeliveryMode("private")}
                />
                Privado
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                Questões / dia
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={questionsPerDay}
                  onChange={(e) => setQuestionsPerDay(Number(e.target.value) || 3)}
                  className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-900"
                />
              </label>
              <label className="block">
                Hora inicial
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={startHour}
                  onChange={(e) => setStartHour(Number(e.target.value) || 7)}
                  className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-900"
                />
              </label>
            </div>
            {deliveryMode === "private" && (
              <div className="max-h-40 overflow-auto rounded-lg border border-slate-200 p-2">
                {users.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum participante listado.</p>
                ) : (
                  users.map((u) => (
                    <label key={u.userJid} className="flex items-center gap-2 py-0.5">
                      <input
                        type="checkbox"
                        checked={Boolean(recipients[u.userJid])}
                        onChange={(e) =>
                          setRecipients((prev) => ({
                            ...prev,
                            [u.userJid]: e.target.checked,
                          }))
                        }
                      />
                      {u.displayLabel}
                    </label>
                  ))
                )}
              </div>
            )}
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
