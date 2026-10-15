"use client"

import { Plus, Trash2 } from "lucide-react"
import type { AgendaEvent, AgendaEventKind, AgendaFieldType } from "@/lib/agenda-types"

const DEFAULT_EVENT_COLOR = "#3b82f6"

const EVENT_COLOR_PRESETS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#0ea5e9",
  "#64748b",
]

export type AgendaEventDraft = {
  id: string | null
  kind_id: string | null
  title: string
  event_date: string
  end_date: string
  start_time: string
  end_time: string
  notes: string
  color: string
  values: Record<string, string>
}

export function blankEventDraft(date: string): AgendaEventDraft {
  return {
    id: null,
    kind_id: null,
    title: "",
    event_date: date,
    end_date: "",
    start_time: "",
    end_time: "",
    notes: "",
    color: DEFAULT_EVENT_COLOR,
    values: {},
  }
}

export function eventToDraft(event: AgendaEvent): AgendaEventDraft {
  return {
    id: event.id,
    kind_id: event.kind_id,
    title: event.title,
    event_date: event.event_date?.slice(0, 10) ?? "",
    end_date: event.end_date?.slice(0, 10) ?? "",
    start_time: event.start_time?.slice(0, 5) ?? "",
    end_time: event.end_time?.slice(0, 5) ?? "",
    notes: event.notes ?? "",
    color: event.color || DEFAULT_EVENT_COLOR,
    values: Object.fromEntries(
      (event.values ?? []).map((value) => [value.field_id, value.value_text ?? ""])
    ),
  }
}

type Props = {
  draft: AgendaEventDraft
  kinds: AgendaEventKind[]
  saving: boolean
  onChange: (draft: AgendaEventDraft) => void
  onSubmit: () => void
  onDelete: () => void
  onCancel: () => void
}

export default function AgendaEventForm({
  draft,
  kinds,
  saving,
  onChange,
  onSubmit,
  onDelete,
  onCancel,
}: Props) {
  const editing = Boolean(draft.id)
  const kind = kinds.find((item) => item.id === draft.kind_id) ?? null

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="space-y-3 border-t border-slate-100 pt-4"
    >
      <p className="text-sm font-medium text-slate-800">
        {editing ? (kind ? `Editar ${kind.name}` : "Editar evento") : "Novo evento"}
      </p>
      <label className="flex max-w-xs flex-col gap-1 text-xs text-slate-600">
        Tipo
        <select
          value={draft.kind_id ?? ""}
          onChange={(e) =>
            onChange({
              ...draft,
              kind_id: e.target.value || null,
              values: {},
            })
          }
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">Pontual</option>
          {kinds.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-2">
        {!kind && (
          <>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Data
              <input
                type="date"
                required
                value={draft.event_date}
                onChange={(e) => onChange({ ...draft, event_date: e.target.value })}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Até
              <input
                type="date"
                value={draft.end_date}
                onChange={(e) => onChange({ ...draft, end_date: e.target.value })}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Início
              <input
                type="time"
                value={draft.start_time}
                onChange={(e) => onChange({ ...draft, start_time: e.target.value })}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Fim
              <input
                type="time"
                value={draft.end_time}
                onChange={(e) => onChange({ ...draft, end_time: e.target.value })}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
          </>
        )}
        <label className="min-w-[180px] flex-1 flex-col gap-1 text-xs text-slate-600">
          {kind ? "Nome" : "Evento"}
          <input
            type="text"
            required
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            placeholder={kind ? "Ex.: SEFAZ DF" : "Reunião, lembrete…"}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      {kind && (
        <div className="grid gap-2 sm:grid-cols-2">
          {kind.fields.map((field) => (
            <KindFieldInput
              key={field.id}
              label={field.label}
              type={field.field_type}
              value={draft.values[field.id] ?? ""}
              onChange={(value) =>
                onChange({ ...draft, values: { ...draft.values, [field.id]: value } })
              }
            />
          ))}
        </div>
      )}
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Nota
        <textarea
          value={draft.notes}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          rows={2}
          placeholder="Opcional"
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {kind ? (
          <span />
        ) : (
          <AgendaColorPicker
            value={draft.color}
            onChange={(color) => onChange({ ...draft, color })}
          />
        )}
        <div className="flex flex-wrap gap-2">
          {editing && (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Excluir
              </button>
            </>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {editing ? "Salvar" : "Evento"}
          </button>
        </div>
      </div>
    </form>
  )
}

function KindFieldInput({
  label,
  type,
  value,
  onChange,
}: {
  label: string
  type: AgendaFieldType
  value: string
  onChange: (value: string) => void
}) {
  const inputType = type === "date" ? "date" : type === "number" ? "number" : "text"
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-600">
      {type === "money" ? `${label} (R$)` : label}
      <input
        type={inputType}
        inputMode={type === "money" ? "decimal" : undefined}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "1" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={type === "money" ? "0,00" : undefined}
        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
      />
    </label>
  )
}

export function AgendaColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-slate-600">
      <span>Cor</span>
      <div className="flex items-center gap-1.5">
        {EVENT_COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`h-7 w-7 rounded-full border-2 transition ${
              value.toLowerCase() === color.toLowerCase()
                ? "scale-110 border-slate-900"
                : "border-transparent hover:scale-105"
            }`}
            style={{ backgroundColor: color }}
            aria-label={`Cor ${color}`}
            aria-pressed={value.toLowerCase() === color.toLowerCase()}
          />
        ))}
        <label
          className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-slate-300"
          title="Cor personalizada"
        >
          <span className="absolute inset-0" style={{ backgroundColor: value }} aria-hidden />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Escolher cor personalizada"
          />
        </label>
      </div>
    </div>
  )
}
