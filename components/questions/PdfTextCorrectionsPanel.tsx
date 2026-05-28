"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

type RuleScope = "statement" | "option" | "both"

type RuleRow = {
  id: string
  pattern: string
  replacement: string
  scope: RuleScope
  enabled: boolean
  priority: number
}

type AcronymRow = {
  id: string
  acronym: string
  enabled: boolean
  priority: number
}

type ApiPayload = {
  rules: RuleRow[]
  acronyms: AcronymRow[]
}

function toInt(v: string, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export default function PdfTextCorrectionsPanel() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [rules, setRules] = useState<RuleRow[]>([])
  const [acronyms, setAcronyms] = useState<AcronymRow[]>([])

  async function loadConfig() {
    setLoading(true)
    setError(null)
    setOk(null)
    try {
      const res = await fetch("/api/questions/import/text-corrections")
      const data = (await res.json()) as ApiPayload | { error: string }
      if (!res.ok) throw new Error("error" in data ? data.error : "Falha ao carregar")
      setRules((data as ApiPayload).rules ?? [])
      setAcronyms((data as ApiPayload).acronyms ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar configurações")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  async function saveConfig() {
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const payload: ApiPayload = {
        rules: rules.map((r) => ({
          ...r,
          pattern: r.pattern.trim(),
          replacement: r.replacement,
          priority: Number(r.priority),
        })),
        acronyms: acronyms.map((a) => ({
          ...a,
          acronym: a.acronym.trim().toUpperCase(),
          priority: Number(a.priority),
        })),
      }
      const res = await fetch("/api/questions/import/text-corrections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as ApiPayload | { error: string }
      if (!res.ok) throw new Error("error" in data ? data.error : "Falha ao salvar")
      setRules((data as ApiPayload).rules ?? [])
      setAcronyms((data as ApiPayload).acronyms ?? [])
      setOk("Configurações salvas.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar configurações")
    } finally {
      setSaving(false)
    }
  }

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.priority - b.priority),
    [rules]
  )
  const sortedAcronyms = useMemo(
    () => [...acronyms].sort((a, b) => a.priority - b.priority),
    [acronyms]
  )

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Correções do parser (global)</h3>
          <p className="text-xs text-slate-600">
            Ajusta enunciado e alternativas após o parse, incluindo siglas (ex.: CBSabrem).
          </p>
        </div>
        <button
          type="button"
          onClick={saveConfig}
          disabled={loading || saving}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar regras"}
        </button>
      </div>

      {(loading || saving) && (
        <div className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Processando...
        </div>
      )}
      {error && <p className="mb-2 text-xs text-red-700">{error}</p>}
      {ok && <p className="mb-2 text-xs text-emerald-700">{ok}</p>}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-700">Expressões</p>
          <button
            type="button"
            onClick={() =>
              setRules((prev) => [
                ...prev,
                {
                  id: `new-rule-${Date.now()}`,
                  pattern: "",
                  replacement: "",
                  scope: "both",
                  enabled: true,
                  priority: (prev.at(-1)?.priority ?? 0) + 10,
                },
              ])
            }
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
          >
            <Plus className="h-3 w-3" /> Adicionar
          </button>
        </div>
        {sortedRules.length === 0 && (
          <p className="text-xs text-slate-500">Nenhuma regra cadastrada.</p>
        )}
        {sortedRules.map((r) => (
          <div key={r.id} className="grid grid-cols-12 gap-2 rounded border bg-white p-2">
            <input
              value={r.pattern}
              onChange={(e) =>
                setRules((prev) =>
                  prev.map((x) => (x.id === r.id ? { ...x, pattern: e.target.value } : x))
                )
              }
              placeholder="Texto a buscar"
              className="col-span-3 rounded border px-2 py-1 text-xs"
            />
            <input
              value={r.replacement}
              onChange={(e) =>
                setRules((prev) =>
                  prev.map((x) => (x.id === r.id ? { ...x, replacement: e.target.value } : x))
                )
              }
              placeholder="Substituir por"
              className="col-span-3 rounded border px-2 py-1 text-xs"
            />
            <select
              value={r.scope}
              onChange={(e) =>
                setRules((prev) =>
                  prev.map((x) =>
                    x.id === r.id ? { ...x, scope: e.target.value as RuleScope } : x
                  )
                )
              }
              className="col-span-2 rounded border px-2 py-1 text-xs"
            >
              <option value="both">Ambos</option>
              <option value="statement">Enunciado</option>
              <option value="option">Alternativas</option>
            </select>
            <input
              type="number"
              value={r.priority}
              onChange={(e) =>
                setRules((prev) =>
                  prev.map((x) =>
                    x.id === r.id ? { ...x, priority: toInt(e.target.value, x.priority) } : x
                  )
                )
              }
              className="col-span-1 rounded border px-2 py-1 text-xs"
              title="Prioridade"
            />
            <label className="col-span-2 inline-flex items-center gap-1 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) =>
                  setRules((prev) =>
                    prev.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x))
                  )
                }
              />
              Ativa
            </label>
            <button
              type="button"
              onClick={() => setRules((prev) => prev.filter((x) => x.id !== r.id))}
              className="col-span-1 inline-flex items-center justify-center text-slate-500 hover:text-red-600"
              title="Excluir regra"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-700">Siglas (allow-list)</p>
          <button
            type="button"
            onClick={() =>
              setAcronyms((prev) => [
                ...prev,
                {
                  id: `new-acronym-${Date.now()}`,
                  acronym: "",
                  enabled: true,
                  priority: (prev.at(-1)?.priority ?? 0) + 10,
                },
              ])
            }
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
          >
            <Plus className="h-3 w-3" /> Adicionar
          </button>
        </div>
        {sortedAcronyms.length === 0 && (
          <p className="text-xs text-slate-500">Nenhuma sigla cadastrada.</p>
        )}
        {sortedAcronyms.map((a) => (
          <div key={a.id} className="grid grid-cols-12 gap-2 rounded border bg-white p-2">
            <input
              value={a.acronym}
              onChange={(e) =>
                setAcronyms((prev) =>
                  prev.map((x) =>
                    x.id === a.id ? { ...x, acronym: e.target.value.toUpperCase() } : x
                  )
                )
              }
              placeholder="Ex.: CBS"
              className="col-span-4 rounded border px-2 py-1 text-xs uppercase"
            />
            <input
              type="number"
              value={a.priority}
              onChange={(e) =>
                setAcronyms((prev) =>
                  prev.map((x) =>
                    x.id === a.id ? { ...x, priority: toInt(e.target.value, x.priority) } : x
                  )
                )
              }
              className="col-span-2 rounded border px-2 py-1 text-xs"
              title="Prioridade"
            />
            <label className="col-span-5 inline-flex items-center gap-1 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={a.enabled}
                onChange={(e) =>
                  setAcronyms((prev) =>
                    prev.map((x) => (x.id === a.id ? { ...x, enabled: e.target.checked } : x))
                  )
                }
              />
              Ativa (split quando colada em palavra)
            </label>
            <button
              type="button"
              onClick={() => setAcronyms((prev) => prev.filter((x) => x.id !== a.id))}
              className="col-span-1 inline-flex items-center justify-center text-slate-500 hover:text-red-600"
              title="Excluir sigla"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
