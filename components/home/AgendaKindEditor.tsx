"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, Download, Plus, Trash2 } from "lucide-react"
import { AgendaColorPicker } from "@/components/home/AgendaEventForm"
import { downloadAgendaKindPdf } from "@/lib/agenda-pdf-download"
import { NOVO_EDITAL_FIELDS, type AgendaEventKind, type AgendaFieldType } from "@/lib/agenda-types"

type FieldDraft = {
  id: string | null
  label: string
  field_type: AgendaFieldType
  color: string
}

type KindDraft = {
  id: string | null
  name: string
  fields: FieldDraft[]
}

const FIELD_TYPES: { id: AgendaFieldType; label: string }[] = [
  { id: "text", label: "Texto" },
  { id: "date", label: "Data" },
  { id: "money", label: "R$" },
  { id: "number", label: "Número" },
]

function blankField(): FieldDraft {
  return { id: null, label: "", field_type: "text", color: "#3b82f6" }
}

function kindToDraft(kind: AgendaEventKind): KindDraft {
  return {
    id: kind.id,
    name: kind.name,
    fields: kind.fields.map((field) => ({
      id: field.id,
      label: field.label,
      field_type: field.field_type,
      color: field.color || "#3b82f6",
    })),
  }
}

function move<T>(items: T[], index: number, delta: number): T[] {
  const next = index + delta
  if (next < 0 || next >= items.length) return items
  const copy = [...items]
  const [item] = copy.splice(index, 1)
  copy.splice(next, 0, item!)
  return copy
}

type Props = {
  userId: string
  kinds: AgendaEventKind[]
  onSaved: () => Promise<void>
  onError: (message: string) => void
}

export default function AgendaKindEditor({ userId, kinds, onSaved, onError }: Props) {
  const [draft, setDraft] = useState<KindDraft>({ id: null, name: "", fields: [] })
  const [saving, setSaving] = useState(false)
  const [includePast, setIncludePast] = useState(false)
  const [downloading, setDownloading] = useState(false)

  function selectKind(kind: AgendaEventKind | null) {
    setDraft(kind ? kindToDraft(kind) : { id: null, name: "", fields: [blankField()] })
  }

  async function saveKind() {
    const name = draft.name.trim()
    if (!name) {
      onError("Dê um nome ao tipo")
      return
    }
    setSaving(true)
    const payload = {
      user_id: userId,
      name,
      fields: draft.fields.map((field) => ({
        id: field.id,
        label: field.label,
        field_type: field.field_type,
        color: field.field_type === "date" ? field.color : null,
      })),
    }
    const res = await fetch("/api/agenda/kinds", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.id ? { ...payload, id: draft.id } : payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      onError(data.error ?? "Erro ao salvar o tipo")
      return
    }
    const saved = data.kind as AgendaEventKind
    setDraft(kindToDraft(saved))
    await onSaved()
  }

  async function removeKind() {
    if (!draft.id) return
    if (!window.confirm("Apagar este tipo também apaga as fichas dele. Continuar?")) return
    setSaving(true)
    const res = await fetch(`/api/agenda/kinds?user_id=${userId}&id=${draft.id}`, {
      method: "DELETE",
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      onError(data.error ?? "Erro ao apagar o tipo")
      return
    }
    setDraft({ id: null, name: "", fields: [] })
    await onSaved()
  }

  async function createNovoEdital() {
    const existing = kinds.find((kind) => kind.name.trim().toLowerCase() === "novo edital")
    if (existing) {
      setDraft(kindToDraft(existing))
      return
    }
    setSaving(true)
    const res = await fetch("/api/agenda/kinds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: "Novo edital",
        fields: NOVO_EDITAL_FIELDS,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      onError(data.error ?? "Erro ao criar Novo edital")
      return
    }
    setDraft(kindToDraft(data.kind as AgendaEventKind))
    await onSaved()
  }

  async function downloadCompiled() {
    if (!draft.id) return
    setDownloading(true)
    try {
      await downloadAgendaKindPdf(userId, draft.id, includePast)
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao baixar PDF")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">Tipos de evento</p>
        <button
          type="button"
          onClick={() => void createNovoEdital()}
          disabled={saving}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Novo edital
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => selectKind(null)}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Novo tipo
        </button>
        {kinds.map((kind) => (
          <button
            key={kind.id}
            type="button"
            onClick={() => selectKind(kind)}
            className={`rounded-lg px-2.5 py-1 text-xs ${
              draft.id === kind.id ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {kind.name}
          </button>
        ))}
      </div>
      {draft.id && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includePast}
              onChange={(e) => setIncludePast(e.target.checked)}
            />
            Incluir passados?
          </label>
          <button
            type="button"
            onClick={() => void downloadCompiled()}
            disabled={downloading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Baixar compilado
          </button>
          <p className="text-xs text-slate-500">
            Passou quando todas as datas preenchidas são anteriores a hoje.
          </p>
        </div>
      )}
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Nome do tipo
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Ex.: Novo edital"
          className="max-w-sm rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <ul className="space-y-2">
        {draft.fields.map((field, index) => (
          <li key={`${field.id ?? "new"}-${index}`} className="flex flex-wrap items-end gap-2">
            <label className="min-w-[140px] flex-1 flex-col gap-1 text-xs text-slate-600">
              Campo
              <input
                value={field.label}
                onChange={(e) => {
                  const fields = [...draft.fields]
                  fields[index] = { ...field, label: e.target.value }
                  setDraft({ ...draft, fields })
                }}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Tipo
              <select
                value={field.field_type}
                onChange={(e) => {
                  const fields = [...draft.fields]
                  fields[index] = { ...field, field_type: e.target.value as AgendaFieldType }
                  setDraft({ ...draft, fields })
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            {field.field_type === "date" && (
              <AgendaColorPicker
                value={field.color}
                onChange={(color) => {
                  const fields = [...draft.fields]
                  fields[index] = { ...field, color }
                  setDraft({ ...draft, fields })
                }}
              />
            )}
            <div className="flex gap-1 pb-0.5">
              <button
                type="button"
                aria-label="Subir campo"
                onClick={() => setDraft({ ...draft, fields: move(draft.fields, index, -1) })}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Descer campo"
                onClick={() => setDraft({ ...draft, fields: move(draft.fields, index, 1) })}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Apagar campo"
                onClick={() =>
                  setDraft({ ...draft, fields: draft.fields.filter((_, item) => item !== index) })
                }
                className="rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDraft({ ...draft, fields: [...draft.fields, blankField()] })}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          Campo
        </button>
        <button
          type="button"
          onClick={() => void saveKind()}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Salvar tipo
        </button>
        {draft.id && (
          <button
            type="button"
            onClick={() => void removeKind()}
            disabled={saving}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            Apagar tipo
          </button>
        )}
      </div>
    </div>
  )
}
