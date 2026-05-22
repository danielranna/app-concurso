"use client"

import type { ConfidenceLevel } from "@/lib/question-types"

type Props = {
  value: ConfidenceLevel
  disabled?: boolean
  onChange: (value: ConfidenceLevel) => void
}

const FLAGS: { key: "inseguro" | "chute"; label: string }[] = [
  { key: "inseguro", label: "Inseguro" },
  { key: "chute", label: "Chute" },
]

export default function ConfidenceToggles({ value, disabled, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs text-slate-500">Confiança:</span>
      {FLAGS.map(({ key, label }) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? "seguro" : key)}
            className={`flex h-9 min-w-[5.5rem] items-center justify-center rounded border px-3 text-xs font-medium transition ${
              active
                ? "border-slate-700 bg-slate-800 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            } disabled:opacity-50`}
            title={active ? "Clique para marcar como Seguro" : label}
          >
            {label}
          </button>
        )
      })}
      <span className="text-xs text-slate-400">
        {value === "seguro" ? "(Seguro — padrão)" : ""}
      </span>
    </div>
  )
}
