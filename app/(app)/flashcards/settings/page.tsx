"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { DEFAULT_WEEKDAY_LIMITS, type WeekdayLimits } from "@/lib/flashcard-types"
import { MessageCircle, RefreshCw } from "lucide-react"

const DAYS = [
  { key: "0", label: "Domingo" },
  { key: "1", label: "Segunda" },
  { key: "2", label: "Terça" },
  { key: "3", label: "Quarta" },
  { key: "4", label: "Quinta" },
  { key: "5", label: "Sexta" },
  { key: "6", label: "Sábado" },
]

type WhatsAppUser = {
  userJid: string
  displayLabel: string
  engaged?: boolean
}

export default function FlashcardsSettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [limits, setLimits] = useState<WeekdayLimits>(DEFAULT_WEEKDAY_LIMITS)
  const [bot, setBot] = useState({
    enabled: false,
    phone_e164: "",
    whatsapp_jid: "" as string | null,
    whatsapp_display_label: "" as string | null,
    start_hour: 7,
    end_hour: 19,
    timezone: "America/Sao_Paulo",
  })
  const [waUsers, setWaUsers] = useState<WhatsAppUser[]>([])
  const [waLoading, setWaLoading] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const [waHint, setWaHint] = useState<string | null>(null)
  const [waWarning, setWaWarning] = useState<string | null>(null)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      const [schedRes, botRes] = await Promise.all([
        fetch(`/api/flashcards/schedule-settings?user_id=${user.id}`),
        fetch(`/api/flashcards/bot/settings/web?user_id=${user.id}`),
      ])
      const sched = await schedRes.json()
      const botData = await botRes.json()
      setLimits(sched.weekday_limits ?? DEFAULT_WEEKDAY_LIMITS)
      setBot({
        enabled: botData.enabled ?? false,
        phone_e164: botData.phone_e164 ?? "",
        whatsapp_jid: botData.whatsapp_jid ?? null,
        whatsapp_display_label: botData.whatsapp_display_label ?? null,
        start_hour: botData.start_hour ?? 7,
        end_hour: botData.end_hour ?? 19,
        timezone: botData.timezone ?? "America/Sao_Paulo",
      })
    })
  }, [router])

  async function fetchWhatsAppUsers() {
    if (!userId) return
    setWaLoading(true)
    setWaError(null)
    setWaWarning(null)
    try {
      const res = await fetch(`/api/flashcards/whatsapp-users?user_id=${userId}`)
      const data = await res.json()
      if (data.error && !data.users?.length) {
        setWaError(data.error)
        setWaHint(data.hint ?? null)
        setWaUsers([])
      } else {
        setWaUsers(data.users ?? [])
        setWaWarning(data.warning ?? null)
        setWaHint(data.hint ?? null)
        if (data.hint && !data.users?.length) {
          setWaError(null)
        }
      }
    } catch {
      setWaError("Falha ao buscar contas. Tente novamente.")
    } finally {
      setWaLoading(false)
    }
  }

  function selectWhatsAppUser(u: WhatsAppUser) {
    setBot((b) => ({
      ...b,
      whatsapp_jid: u.userJid,
      whatsapp_display_label: u.displayLabel,
    }))
  }

  async function saveAll() {
    if (!userId) return
    if (bot.enabled && !bot.whatsapp_jid) {
      alert("Ative o bot só depois de vincular uma conta WhatsApp (Buscar contas → escolher seu nome).")
      return
    }
    await Promise.all([
      fetch("/api/flashcards/schedule-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, weekday_limits: limits }),
      }),
      fetch("/api/flashcards/bot/settings/web", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          enabled: bot.enabled,
          phone_e164: bot.phone_e164 || null,
          whatsapp_jid: bot.whatsapp_jid,
          whatsapp_display_label: bot.whatsapp_display_label,
          start_hour: bot.start_hour,
          end_hour: bot.end_hour,
          timezone: bot.timezone,
        }),
      }),
    ])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function generateKey() {
    if (!userId) return
    const res = await fetch("/api/flashcards/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
    const data = await res.json()
    setNewApiKey(data.api_key)
  }

  if (!userId) return null

  return (
    <main className="mx-auto max-w-xl px-6 py-6">
      <Link href="/flashcards" className="text-sm text-slate-600 hover:underline">
        ← Voltar
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Configurações</h1>

      <section className="mt-8">
        <h2 className="font-medium text-slate-800">Limite de cards por dia da semana</h2>
        <p className="text-sm text-slate-500">Deixe vazio para sem limite.</p>
        <div className="mt-4 space-y-2">
          {DAYS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <input
                type="number"
                min={0}
                placeholder="∞"
                value={limits[key] ?? ""}
                onChange={(e) => {
                  const v = e.target.value
                  setLimits((l) => ({
                    ...l,
                    [key]: v === "" ? null : parseInt(v, 10),
                  }))
                }}
                className="w-24 rounded border px-2 py-1 text-sm"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 border-t pt-8">
        <h2 className="flex items-center gap-2 font-medium text-slate-800">
          <MessageCircle className="h-5 w-5" />
          Bot WhatsApp (VPS)
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Vincule seu nome do grupo (após <code className="text-xs">/sync-membros</code> no WhatsApp).
          O bot envia lembretes e cards no privado para esse JID.
        </p>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <button
            type="button"
            onClick={fetchWhatsAppUsers}
            disabled={waLoading}
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${waLoading ? "animate-spin" : ""}`} />
            {waLoading ? "Buscando..." : "Buscar contas do WhatsApp"}
          </button>

          {waError && (
            <p className="mt-3 text-sm text-red-600">{waError}</p>
          )}
          {waHint && !waUsers.length && (
            <p className="mt-2 text-sm text-amber-700">{waHint}</p>
          )}
          {waWarning && (
            <p className="mt-2 text-sm text-amber-700">{waWarning}</p>
          )}

          {waUsers.length > 0 && (
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
              {waUsers.map((u) => (
                <li key={u.userJid}>
                  <button
                    type="button"
                    onClick={() => selectWhatsAppUser(u)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      bot.whatsapp_jid === u.userJid
                        ? "bg-emerald-600 text-white"
                        : "bg-white hover:bg-slate-100"
                    }`}
                  >
                    {u.displayLabel}
                    {u.engaged && (
                      <span className="ml-2 text-xs opacity-80">(engajado)</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {bot.whatsapp_jid && (
            <p className="mt-3 text-sm text-emerald-800">
              Vinculado: <strong>{bot.whatsapp_display_label ?? bot.whatsapp_jid}</strong>
            </p>
          )}
        </div>

        <label className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={bot.enabled}
            onChange={(e) => setBot((b) => ({ ...b, enabled: e.target.checked }))}
          />
          <span className="text-sm">Ativar lembretes pelo bot</span>
        </label>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500">
            Telefone manual (opcional, legado)
          </summary>
          <input
            className="mt-2 w-full rounded border px-3 py-2 text-sm"
            placeholder="+5511999999999"
            value={bot.phone_e164}
            onChange={(e) => setBot((b) => ({ ...b, phone_e164: e.target.value }))}
          />
        </details>

        <div className="mt-2 flex gap-4">
          <div>
            <label className="text-xs text-slate-500">Início (h)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={bot.start_hour}
              onChange={(e) => setBot((b) => ({ ...b, start_hour: +e.target.value }))}
              className="block w-20 rounded border px-2 py-1"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Fim (h)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={bot.end_hour}
              onChange={(e) => setBot((b) => ({ ...b, end_hour: +e.target.value }))}
              className="block w-20 rounded border px-2 py-1"
            />
          </div>
        </div>

        <button
          onClick={generateKey}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm"
        >
          Gerar API key para o bot (VPS)
        </button>
        {newApiKey && (
          <p className="mt-2 break-all rounded bg-amber-50 p-3 text-xs text-amber-900">
            Copie agora e coloque na VPS como <code>FLASHCARDS_API_KEY</code>:{" "}
            <strong>{newApiKey}</strong>
          </p>
        )}
      </section>

      <button
        onClick={saveAll}
        className="mt-8 w-full rounded-lg bg-slate-900 py-3 text-white"
      >
        {saved ? "Salvo!" : "Salvar configurações"}
      </button>
    </main>
  )
}
