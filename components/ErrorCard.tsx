"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import ErrorOptionsMenu from "@/components/ErrorOptionsMenu"

type ErrorCardProps = {
  error: {
    id: string
    error_text: string
    correction_text: string
    description?: string
    reference_link?: string
    error_status: string
    error_type?: string
    topics: {
      name: string
      subjects: {
        name: string
      } | null
    } | null
  }
  onEdit: () => void
  onDeleted: () => void
}

const statusStyles: Record<
  string,
  { label: string; badge: string; border: string }
> = {
  normal: {
    label: "Normal",
    badge: "bg-slate-100 text-slate-700",
    border: "border-slate-200"
  },
  critico: {
    label: "Crítico",
    badge: "bg-red-100 text-red-700",
    border: "border-red-300"
  },
  reincidente: {
    label: "Reincidente",
    badge: "bg-yellow-100 text-yellow-800",
    border: "border-yellow-300"
  },
  aprendido: {
    label: "Aprendido",
    badge: "bg-green-100 text-green-700",
    border: "border-green-300"
  }
}

export default function ErrorCard({
  error,
  onEdit,
  onDeleted
}: ErrorCardProps) {
  const [open, setOpen] = useState(false)

  if (!error) return null

  const style =
    statusStyles[error.error_status] || statusStyles.normal

  const subjectName =
    error.topics?.subjects?.name ?? "Sem matéria"

  const topicName =
    error.topics?.name ?? "Sem tema"

  const errorTypeLabel = error.error_type
    ? `Erro de ${error.error_type}`
    : "Erro"

  return (
    <div
      className={`relative rounded-xl border ${style.border} bg-white p-4 shadow-sm transition hover:shadow-md`}
    >
      {/* TOPO */}
      <div className="mb-2 flex items-start justify-between gap-3">
        {/* TEXTO */}
        <div className="flex flex-1 flex-col gap-1">
          <h3 className="text-sm font-semibold text-slate-800">
            {topicName}
          </h3>

          <p
            className="text-xs text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis"
            title={`${subjectName} – ${errorTypeLabel}`}
          >
            {subjectName} – {errorTypeLabel}
          </p>
        </div>

        {/* AÇÕES */}
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
          >
            {style.label}
          </span>

          <button
            onClick={() => setOpen(v => !v)}
            className="rounded-md p-1 text-purple-600 hover:bg-purple-50"
            title="Visualizar"
          >
            <Eye size={16} />
          </button>

          <ErrorOptionsMenu
            onEdit={onEdit}
            onDelete={onDeleted}
          />
        </div>
      </div>

      {/* ERRO */}
      <div className="mt-3">
        <p className="text-xs font-semibold text-red-600">
          Erro
        </p>
        <p className="max-h-24 overflow-auto break-words text-sm text-slate-800">
          {error.error_text}
        </p>
      </div>

      {/* CONTEÚDO OCULTO */}
      {open && (
        <div className="mt-4 space-y-3 border-t pt-3">
          <div>
            <p className="text-xs font-semibold text-green-600">
              Correção
            </p>
            <p className="max-h-24 overflow-auto break-words text-sm text-slate-800">
              {error.correction_text}
            </p>
          </div>

          {error.description && (
            <p className="text-sm text-slate-500">
              {error.description}
            </p>
          )}

          {error.reference_link && (
            <a
              href={error.reference_link}
              target="_blank"
              className="inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              🔗 Ir para questão
            </a>
          )}
        </div>
      )}
    </div>
  )
}
