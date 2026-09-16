"use client"

import { useEffect, useState } from "react"
import { KeyRound, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  defaultModelForProvider,
  modelsForProvider,
  resolvePreferredModel,
  type AiProvider,
} from "@/lib/ai/models"

type Status =
  | { configured: false }
  | {
      configured: true
      provider: AiProvider
      key_hint: string
      updated_at: string
      preferred_model: string
    }

type Props = {
  open?: boolean
  onClose?: () => void
  onSaved?: () => void
  embedded?: boolean
}

export default function CoachAiCredentialsModal({
  open = false,
  onClose,
  onSaved,
  embedded = false,
}: Props) {
  const [userId, setUserId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [provider, setProvider] = useState<AiProvider>("openai")
  const [preferredModel, setPreferredModel] = useState(
    defaultModelForProvider("openai")
  )
  const [apiKey, setApiKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function loadStatus(uid: string) {
    const res = await fetch(`/api/coach/ai-credentials?user_id=${uid}`)
    const data = await res.json()
    if (data.configured) {
      setStatus(data)
      setProvider(data.provider)
      setPreferredModel(
        resolvePreferredModel(data.provider, data.preferred_model)
      )
    } else {
      setStatus({ configured: false })
    }
  }

  useEffect(() => {
    if (!embedded && !open) return
    setError(null)
    setSaved(false)
    setApiKey("")
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      loadStatus(user.id)
    })
  }, [open, embedded])

  function handleProviderChange(next: AiProvider) {
    setProvider(next)
    setPreferredModel((prev) => resolvePreferredModel(next, prev))
  }

  async function handleSave() {
    if (!userId || !apiKey.trim()) {
      setError("Cole sua chave de API.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/coach/ai-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          api_key: apiKey.trim(),
          provider,
          preferred_model: preferredModel,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.")
        return
      }
      setStatus(data)
      setPreferredModel(
        resolvePreferredModel(data.provider, data.preferred_model)
      )
      setApiKey("")
      setSaved(true)
      onSaved?.()
    } catch {
      setError("Erro de rede.")
    } finally {
      setLoading(false)
    }
  }

  async function handleSavePreferences() {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/coach/ai-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          provider,
          preferred_model: preferredModel,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Não foi possível atualizar.")
        return
      }
      setStatus(data)
      setPreferredModel(
        resolvePreferredModel(data.provider, data.preferred_model)
      )
      setSaved(true)
      onSaved?.()
    } catch {
      setError("Erro de rede.")
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove() {
    if (!userId) return
    if (!confirm("Remover sua chave? Os relatórios voltam ao modo por regras.")) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/coach/ai-credentials?user_id=${userId}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Erro ao remover.")
        return
      }
      setStatus({ configured: false })
      onSaved?.()
    } finally {
      setLoading(false)
    }
  }

  if (!embedded && !open) return null

  const modelOptions = modelsForProvider(provider)
  const prefsDirty =
    status?.configured === true &&
    (status.provider !== provider || status.preferred_model !== preferredModel)

  const form = (
        <>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-violet-600" />
            <h2
              id="coach-ai-creds-title"
              className="text-lg font-semibold text-slate-900"
            >
              Chave de IA (sua conta)
            </h2>
          </div>
          {!embedded && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          )}
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Relatórios com IA usam a chave que você cadastrar. O gasto vai para a
          sua conta na OpenAI ou Anthropic — não para quem hospeda o app.
        </p>

        {status?.configured && (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Chave {status.provider === "openai" ? "OpenAI" : "Anthropic"}{" "}
            ativa ({status.key_hint}) · {status.preferred_model}
          </p>
        )}

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Provedor
        </label>
        <select
          className="mb-3 w-full rounded-lg border border-slate-300 p-2 text-slate-900"
          value={provider}
          onChange={(e) =>
            handleProviderChange(e.target.value as AiProvider)
          }
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Modelo
        </label>
        <select
          className="mb-3 w-full rounded-lg border border-slate-300 p-2 text-slate-900"
          value={preferredModel}
          onChange={(e) => setPreferredModel(e.target.value)}
        >
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          {status?.configured ? "Nova chave (substitui a atual)" : "Chave de API"}
        </label>
        <input
          type="password"
          autoComplete="off"
          placeholder={
            provider === "openai" ? "sk-proj-..." : "sk-ant-..."
          }
          className="mb-3 w-full rounded-lg border border-slate-300 p-2 font-mono text-sm text-slate-900"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />

        {error && (
          <p className="mb-3 text-sm text-red-600">{error}</p>
        )}
        {saved && (
          <p className="mb-3 text-sm text-emerald-700">Configuração salva.</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || !apiKey.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading && apiKey.trim() ? "Validando…" : "Salvar chave"}
          </button>
          {status?.configured && (
            <button
              type="button"
              onClick={handleSavePreferences}
              disabled={loading || !prefsDirty}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading && !apiKey.trim() ? "Salvando…" : "Salvar modelo"}
            </button>
          )}
          {status?.configured && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Remover
            </button>
          )}
          {!embedded && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Fechar
          </button>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Crie a chave em{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="text-violet-700 underline"
          >
            platform.openai.com
          </a>
          . Sem chave, os relatórios continuam por regras (grátis).
        </p>
        </>
  )

  if (embedded) {
    return <div className="max-w-xl">{form}</div>
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-labelledby="coach-ai-creds-title"
      >
        {form}
      </div>
    </div>
  )
}
