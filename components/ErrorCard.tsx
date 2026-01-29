"use client"

import { useState, useEffect } from "react"
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
  allCardsExpanded?: boolean
  availableStatuses?: Array<{ id: string; name: string; color?: string | null }>
  onStatusChange?: (errorId: string, newStatus: string) => void
}

function getStatusStyle(status: string): { label: string; badge: string; border: string } {
  const defaultStyles: Record<
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
    crítico: {
      label: "Crítico",
      badge: "bg-red-100 text-red-700",
      border: "border-red-300"
    },
    reincidente: {
      label: "Reincidente",
      badge: "bg-yellow-100 text-yellow-800",
      border: "border-yellow-300"
    },
    Reincidente: {
      label: "Reincidente",
      badge: "bg-yellow-100 text-yellow-800",
      border: "border-yellow-300"
    },
    aprendido: {
      label: "Aprendido",
      badge: "bg-green-100 text-green-700",
      border: "border-green-300"
    },
    consolidado: {
      label: "Consolidado",
      badge: "bg-green-100 text-green-700",
      border: "border-green-300"
    },
    Consolidado: {
      label: "Consolidado",
      badge: "bg-green-100 text-green-700",
      border: "border-green-300"
    }
  }

  // Normaliza o status para lowercase para busca, mas mantém original para display
  const normalizedStatus = status?.toLowerCase() || "normal"
  const statusKey = normalizedStatus === "reincidente" ? "reincidente" : 
                     normalizedStatus === "critico" || normalizedStatus === "crítico" ? "critico" :
                     normalizedStatus

  return defaultStyles[statusKey] || defaultStyles[status] || {
    label: status.charAt(0).toUpperCase() + status.slice(1),
    badge: "bg-blue-100 text-blue-700",
    border: "border-blue-300"
  }
}

export default function ErrorCard({
  error,
  onEdit,
  onDeleted,
  allCardsExpanded = false,
  availableStatuses = [],
  onStatusChange
}: ErrorCardProps) {
  const [open, setOpen] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)

  // Sincroniza com allCardsExpanded
  useEffect(() => {
    setOpen(allCardsExpanded)
  }, [allCardsExpanded])

  if (!error) return null

  const style = getStatusStyle(error.error_status)

  // Busca a cor do status se disponível
  const statusColor = availableStatuses?.find(s => s.name === error.error_status)?.color
  
  // Se tem cor customizada, usa ela diretamente no style
  const borderStyle = statusColor 
    ? { borderColor: statusColor, borderWidth: "2px" }
    : {}

  const subjectName =
    error.topics?.subjects?.name ?? "Sem matéria"

  const topicName =
    error.topics?.name ?? "Sem tema"

  const errorTypeLabel = error.error_type
    ? `Erro de ${error.error_type}`
    : "Erro"

  return (
    <div
      className={`relative rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${!statusColor ? style.border : ""}`}
      style={borderStyle}
    >
      {/* TOPO */}
      <div className="mb-2 flex items-start justify-between gap-2 min-w-0">
        {/* TEXTO */}
        <div className="flex flex-1 flex-col gap-1 min-w-0 overflow-hidden">
          <h3 className="text-sm font-semibold text-slate-800 truncate" title={topicName}>
            {topicName}
          </h3>

          <p
            className="text-xs text-slate-500 truncate"
            title={`${subjectName} – ${errorTypeLabel}`}
          >
            {subjectName} – {errorTypeLabel}
          </p>
        </div>

        {/* AÇÕES */}
        <div className="flex shrink-0 items-center gap-1.5 flex-nowrap">
          {/* Status clicável */}
          <div className="relative shrink-0">
            {onStatusChange && availableStatuses.length > 0 ? (
              <>
                <button
                  onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer hover:opacity-80 transition whitespace-nowrap ${statusColor ? "" : style.badge}`}
                  style={statusColor ? {
                    backgroundColor: statusColor,
                    color: "#ffffff"
                  } : {}}
                  title="Clique para alterar status"
                >
                  {style.label}
                </button>
                {statusMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setStatusMenuOpen(false)}
                    />
                    <div className="absolute right-0 z-20 mt-2 w-40 rounded-md border bg-white shadow-lg">
                      {availableStatuses.map(status => (
                        <button
                          key={status.id}
                          onClick={() => {
                            onStatusChange(error.id, status.name)
                            setStatusMenuOpen(false)
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${
                            error.error_status === status.name ? "bg-slate-100" : ""
                          }`}
                        >
                          <span className="capitalize">{status.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor ? "" : style.badge}`}
                style={statusColor ? {
                  backgroundColor: statusColor,
                  color: "#ffffff"
                } : {}}
              >
                {style.label}
              </span>
            )}
          </div>

          <button
            onClick={() => setOpen(v => !v)}
            className="rounded-md p-1 text-slate-700 hover:bg-slate-100 shrink-0"
            title="Visualizar"
          >
            <Eye size={16} />
          </button>

          <div className="shrink-0">
            <ErrorOptionsMenu
              onEdit={onEdit}
              onDelete={onDeleted}
            />
          </div>
        </div>
      </div>

      {/* ERRO */}
      <div className="mt-3">
        <p className="text-xs font-semibold text-red-600">
          Erro
        </p>
        <div 
          className="break-words text-sm text-slate-800 leading-relaxed prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: error.error_text }}
        />
      </div>

      {/* CONTEÚDO OCULTO */}
      {open && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-green-50 p-3">
            <p className="mb-2 text-xs font-semibold text-green-700">
              Correção
            </p>
            <div 
              className="break-words text-sm text-slate-800 leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: error.correction_text }}
            />
          </div>

          {error.description && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold text-slate-600">
                Descrição
              </p>
              <div 
                className="text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: error.description }}
              />
            </div>
          )}

          {error.reference_link && (
            <div className="pt-2">
              <a
                href={error.reference_link.startsWith('http://') || error.reference_link.startsWith('https://') 
                  ? error.reference_link 
                  : `https://${error.reference_link}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 transition hover:text-blue-700 hover:underline"
              >
                🔗 Ir para questão
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
