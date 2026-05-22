"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { DEFAULT_WEEKDAY_LIMITS, type WeekdayLimits } from "@/lib/flashcard-types"
import { Link2, MessageCircle, RefreshCw, Unlink } from "lucide-react"

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

function apiKeyStorageKey(userId: string) {
  return `fc_api_key_${userId}`
}

export default function FlashcardsSettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [limits, setLimits] = useState<WeekdayLimits>(DEFAULT_WEEKDAY_LIMITS)
  const [bot, setBot] = useState({
    enabled: false,
    phone_e164: "",
    whatsapp_jid: null as string | null,
    whatsapp_display_label: null as string | null,
    whatsapp_authorized: false,
    start_hour: 7,
    end_hour: 19,
    timezone: "America/Sao_Paulo",
  })
  const [waUsers, setWaUsers] = useState<WhatsAppUser[]>([])
  const [waLoading, setWaLoading] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const [waHint, setWaHint] = useState<string | null>(null)
  const [waWarning, setWaWarning] = useState<string | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [linkMessage, setLinkMessage] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const loadBotSettings = useCallback(async (uid: string) => {
    const res = await fetch(`/api/flashcards/bot/settings/web?user_id=${uid}`)
    const botData = await res.json()
    setBot({
      enabled: botData.enabled ?? false,
      phone_e164: botData.phone_e164 ?? "",
      whatsapp_jid: botData.whatsapp_jid ?? null,
      whatsapp_display_label: botData.whatsapp_display_label ?? null,
      whatsapp_authorized: botData.whatsapp_authorized ?? false,
      start_hour: botData.start_hour ?? 7,
      end_hour: botData.end_hour ?? 19,
      timezone: botData.timezone ?? "America/Sao_Paulo",
    })
    const stored = sessionStorage.getItem(apiKeyStorageKey(uid))
    if (stored) setApiKeyInput(stored)
  }, [])

  useEffect(() => {
    if (!userId || !bot.whatsapp_jid || bot.whatsapp_authorized) return
    const t = setInterval(() => loadBotSettings(userId), 15000)
    return () => clearInterval(t)
  }, [userId, bot.whatsapp_jid, bot.whatsapp_authorized, loadBotSettings])

  async function confirmAuthorizedManually() {
    if (!userId) return
    setLinkLoading(true)
    setLinkError(null)
    try {
      const res = await fetch("/api/flashcards/bot/whatsapp-authorized/web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLinkError(data.error ?? "Falha ao confirmar")
        return
      }
      setBot((b) => ({ ...b, whatsapp_authorized: true }))
      setLinkMessage("WhatsApp marcado como autorizado neste app.")
      await loadBotSettings(userId)
    } catch {
      setLinkError("Erro ao confirmar autorização.")
    } finally {
      setLinkLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      const [schedRes, keysRes] = await Promise.all([
        fetch(`/api/flashcards/schedule-settings?user_id=${user.id}`),
        fetch(`/api/flashcards/api-keys?user_id=${user.id}`),
      ])
      const sched = await schedRes.json()
      const keys = await keysRes.json()
      setLimits(sched.weekday_limits ?? DEFAULT_WEEKDAY_LIMITS)
      setHasApiKey(Array.isArray(keys) && keys.length > 0)
      await loadBotSettings(user.id)
    })
  }, [router, loadBotSettings])

  function getApiKeyForLink(): string | null {
    const k = newApiKey ?? apiKeyInput.trim()
    return k.startsWith("fc_") ? k : null
  }

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
      whatsapp_authorized: false,
    }))
    setLinkMessage(null)
    setLinkError(null)
  }

  async function saveBotSettingsOnly() {
    if (!userId) return
    await fetch("/api/flashcards/bot/settings/web", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        enabled: bot.enabled,
        phone_e164: bot.phone_e164 || null,
        whatsapp_jid: bot.whatsapp_jid,
        whatsapp_display_label: bot.whatsapp_display_label,
        whatsapp_authorized: bot.whatsapp_authorized,
        start_hour: bot.start_hour,
        end_hour: bot.end_hour,
        timezone: bot.timezone,
      }),
    })
  }

  async function requestWhatsAppLink() {
    if (!userId || !bot.whatsapp_jid) {
      setLinkError("Escolha uma conta na lista antes de vincular.")
      return
    }
    const apiKey = getApiKeyForLink()
    if (!apiKey) {
      setLinkError(
        "Gere uma API key (fc_...) abaixo e copie, ou cole a chave que você já salvou."
      )
      return
    }

    setLinkLoading(true)
    setLinkError(null)
    setLinkMessage(null)

    try {
      await saveBotSettingsOnly()

      const res = await fetch("/api/flashcards/whatsapp-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          userJid: bot.whatsapp_jid,
          apiKey,
          displayLabel: bot.whatsapp_display_label,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setLinkError(data.error ?? "Falha ao solicitar confirmação")
        return
      }

      sessionStorage.setItem(apiKeyStorageKey(userId), apiKey)
      setHasApiKey(true)
      setLinkMessage(
        data.message ??
          "Confira o WhatsApp e responda SIM para autorizar. A mensagem pode levar até ~90 segundos."
      )
      setBot((b) => ({ ...b, whatsapp_authorized: false }))
      await loadBotSettings(userId)
    } catch {
      setLinkError("Erro de rede ao vincular.")
    } finally {
      setLinkLoading(false)
    }
  }

  async function unlinkWhatsApp() {
    if (!userId) return
    if (!confirm("Desvincular WhatsApp? Lembretes e cards no privado serão desativados até vincular de novo.")) {
      return
    }

    setLinkLoading(true)
    setLinkError(null)
    setLinkMessage(null)

    const apiKey = getApiKeyForLink()

    try {
      const res = await fetch("/api/flashcards/whatsapp-unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, apiKey: apiKey ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLinkError(data.error ?? "Falha ao desvincular")
        return
      }
      setBot((b) => ({
        ...b,
        whatsapp_jid: null,
        whatsapp_display_label: null,
        whatsapp_authorized: false,
        enabled: false,
      }))
      setLinkMessage(data.message ?? "WhatsApp desvinculado.")
      await loadBotSettings(userId)
    } catch {
      setLinkError("Erro ao desvincular.")
    } finally {
      setLinkLoading(false)
    }
  }

  async function saveAll() {
    if (!userId) return
    if (bot.enabled && !bot.whatsapp_jid) {
      alert("Ative o bot só depois de vincular o WhatsApp.")
      return
    }
    if (bot.enabled && bot.whatsapp_jid && !bot.whatsapp_authorized) {
      const ok = confirm(
        "O WhatsApp ainda não foi autorizado (SIM no privado). Ativar lembretes mesmo assim?"
      )
      if (!ok) return
    }
    await Promise.all([
      fetch("/api/flashcards/schedule-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, weekday_limits: limits }),
      }),
      saveBotSettingsOnly(),
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
    if (data.api_key) {
      setNewApiKey(data.api_key)
      setApiKeyInput(data.api_key)
      sessionStorage.setItem(apiKeyStorageKey(userId), data.api_key)
      setHasApiKey(true)
    }
  }

  if (!userId) return null

  const pendingAuth = bot.whatsapp_jid && !bot.whatsapp_authorized

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
          WhatsApp (bot na VPS)
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Cada pessoa usa sua própria <code className="text-xs">fc_...</code> — não precisa
          trocar a chave na VPS quando outra pessoa entrar.
        </p>

        {bot.whatsapp_authorized && bot.whatsapp_jid && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            WhatsApp autorizado — {bot.whatsapp_display_label ?? "conta vinculada"}
          </div>
        )}

        {pendingAuth && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>
              Aguardando confirmação no app para{" "}
              <strong>{bot.whatsapp_display_label}</strong>.
            </p>
            <p className="mt-2 text-xs text-amber-800">
              Se você já respondeu <strong>SIM</strong> e o bot disse &quot;Vínculo
              autorizado&quot;, o WhatsApp está OK no bot — só falta o Papa Vagas avisar
              este app (ou clique abaixo).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={confirmAuthorizedManually}
                disabled={linkLoading}
                className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                Já respondi SIM no WhatsApp
              </button>
              <button
                type="button"
                onClick={() => userId && loadBotSettings(userId)}
                disabled={linkLoading}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs hover:bg-amber-100"
              >
                Atualizar status
              </button>
            </div>
          </div>
        )}

        {linkMessage && (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            {linkMessage}
          </div>
        )}
        {linkError && (
          <p className="mt-3 text-sm text-red-600">{linkError}</p>
        )}

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <button
            type="button"
            onClick={fetchWhatsAppUsers}
            disabled={waLoading}
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${waLoading ? "animate-spin" : ""}`} />
            Buscar contas do WhatsApp
          </button>

          {waError && <p className="mt-3 text-sm text-red-600">{waError}</p>}
          {waHint && !waUsers.length && (
            <p className="mt-2 text-sm text-amber-700">{waHint}</p>
          )}
          {waWarning && <p className="mt-2 text-sm text-amber-700">{waWarning}</p>}

          {waUsers.length > 0 && (
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
              {waUsers.map((u) => (
                <li key={u.userJid}>
                  <button
                    type="button"
                    onClick={() => selectWhatsAppUser(u)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      bot.whatsapp_jid === u.userJid
                        ? "bg-emerald-600 text-white"
                        : "bg-white hover:bg-slate-100"
                    }`}
                  >
                    {u.displayLabel}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={requestWhatsAppLink}
              disabled={linkLoading || !bot.whatsapp_jid}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" />
              {linkLoading ? "Enviando..." : "Vincular e pedir confirmação"}
            </button>
            {bot.whatsapp_jid && (
              <>
                <button
                  type="button"
                  onClick={requestWhatsAppLink}
                  disabled={linkLoading}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Reenviar confirmação
                </button>
                <button
                  type="button"
                  onClick={unlinkWhatsApp}
                  disabled={linkLoading}
                  className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  <Unlink className="h-4 w-4" />
                  Desvincular
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-800">API key desta conta</p>
          <p className="mt-1 text-xs text-slate-500">
            {hasApiKey
              ? "Use a chave fc_... que você gerou (cole abaixo se não tiver mais na tela)."
              : "Gere uma chave antes de vincular."}
          </p>
          <input
            type="password"
            autoComplete="off"
            placeholder="fc_..."
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value)
              if (userId && e.target.value.startsWith("fc_")) {
                sessionStorage.setItem(apiKeyStorageKey(userId), e.target.value)
              }
            }}
            className="mt-2 w-full rounded border px-3 py-2 font-mono text-sm"
          />
          <button
            onClick={generateKey}
            className="mt-2 rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            {hasApiKey ? "Gerar nova API key" : "Gerar API key"}
          </button>
          {newApiKey && (
            <p className="mt-2 break-all rounded bg-amber-50 p-3 text-xs text-amber-900">
              Copie agora (só aparece uma vez): <strong>{newApiKey}</strong>
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
      </section>

      <button
        onClick={saveAll}
        className="mt-8 w-full rounded-lg bg-slate-900 py-3 text-white"
      >
        {saved ? "Salvo!" : "Salvar horários e limites"}
      </button>
    </main>
  )
}
