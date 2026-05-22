"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { DEFAULT_WEEKDAY_LIMITS, type WeekdayLimits } from "@/lib/flashcard-types"

const DAYS = [
  { key: "0", label: "Domingo" },
  { key: "1", label: "Segunda" },
  { key: "2", label: "Terça" },
  { key: "3", label: "Quarta" },
  { key: "4", label: "Quinta" },
  { key: "5", label: "Sexta" },
  { key: "6", label: "Sábado" },
]

export default function FlashcardsSettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [limits, setLimits] = useState<WeekdayLimits>(DEFAULT_WEEKDAY_LIMITS)
  const [bot, setBot] = useState({
    enabled: false,
    phone_e164: "",
    start_hour: 7,
    end_hour: 19,
    timezone: "America/Sao_Paulo",
  })
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
        start_hour: botData.start_hour ?? 7,
        end_hour: botData.end_hour ?? 19,
        timezone: botData.timezone ?? "America/Sao_Paulo",
      })
    })
  }, [router])

  async function saveAll() {
    if (!userId) return
    await Promise.all([
      fetch("/api/flashcards/schedule-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, weekday_limits: limits }),
      }),
      fetch("/api/flashcards/bot/settings/web", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, ...bot }),
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
        <h2 className="font-medium text-slate-800">Bot WhatsApp (VPS)</h2>
        <label className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={bot.enabled}
            onChange={(e) => setBot((b) => ({ ...b, enabled: e.target.checked }))}
          />
          <span className="text-sm">Ativar lembretes pelo bot</span>
        </label>
        <input
          className="mt-2 w-full rounded border px-3 py-2 text-sm"
          placeholder="Telefone E.164 (+5511999999999)"
          value={bot.phone_e164}
          onChange={(e) => setBot((b) => ({ ...b, phone_e164: e.target.value }))}
        />
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
          Gerar API key para o bot
        </button>
        {newApiKey && (
          <p className="mt-2 break-all rounded bg-amber-50 p-3 text-xs text-amber-900">
            Copie agora: <strong>{newApiKey}</strong>
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
