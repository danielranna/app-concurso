"use client"

import { useState, useEffect } from "react"
import { Eye, CheckCircle2 } from "lucide-react"
import ErrorOptionsMenu from "@/components/ErrorOptionsMenu"
import {
  CONSOLIDATED_STATUS_HINT,
  LEARNING_STATUS_LABELS,
  type LearningStatus,
} from "@/lib/error-learning-status"

type ErrorCardProps = {
  error: {
    id: string
    error_text: string
    correction_text: string
    description?: string
    reference_link?: string
    error_status: string
    error_type?: string
    motivo?: string | null
    explanation?: string | null
    knowledge_summary?: string | null
    recurrence_count?: number | null
    learning_status?: string | null
    last_reviewed_at?: string | null
    next_review_at?: string | null
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
  onMotivoSave?: (errorId: string, motivo: string) => Promise<void> | void
  reviewMode?: boolean
  onMarkReviewed?: (errorId: string) => void
}

function getStatusStyle(status: string): { label: string; badge: string; border: string } {
  const defaultStyles: Record<
    string,
    { label: string; badge: string; border: string }
  > = {
    normal: {
      label: "Normal",
      badge: "bg-slate-100 text-slate-700",
      border: "border-slate-200",
    },
    critico: {
      label: "Crítico",
      badge: "bg-red-100 text-red-700",
      border: "border-red-300",
    },
    crítico: {
      label: "Crítico",
      badge: "bg-red-100 text-red-700",
      border: "border-red-300",
    },
    reincidente: {
      label: "Reincidente",
      badge: "bg-yellow-100 text-yellow-800",
      border: "border-yellow-300",
    },
    Reincidente: {
      label: "Reincidente",
      badge: "bg-yellow-100 text-yellow-800",
      border: "border-yellow-300",
    },
    aprendido: {
      label: "Aprendido",
      badge: "bg-green-100 text-green-700",
      border: "border-green-300",
    },
    consolidado: {
      label: "Consolidado",
      badge: "bg-green-100 text-green-700",
      border: "border-green-300",
    },
    Consolidado: {
      label: "Consolidado",
      badge: "bg-green-100 text-green-700",
      border: "border-green-300",
    },
  }

  const normalizedStatus = status?.toLowerCase() || "normal"
  const statusKey =
    normalizedStatus === "reincidente"
      ? "reincidente"
      : normalizedStatus === "critico" || normalizedStatus === "crítico"
        ? "critico"
        : normalizedStatus

  return (
    defaultStyles[statusKey] ||
    defaultStyles[status] || {
      label: status.charAt(0).toUpperCase() + status.slice(1),
      badge: "bg-blue-100 text-blue-700",
      border: "border-blue-300",
    }
  )
}

function formatDate(iso?: string | null) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

export default function ErrorCard({
  error,
  onEdit,
  onDeleted,
  allCardsExpanded = false,
  availableStatuses = [],
  onStatusChange,
  onMotivoSave,
  reviewMode = false,
  onMarkReviewed,
}: ErrorCardProps) {
  const [open, setOpen] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [editingMotivo, setEditingMotivo] = useState(false)
  const [motivoDraft, setMotivoDraft] = useState(error.motivo ?? "")
  const [savingMotivo, setSavingMotivo] = useState(false)

  useEffect(() => {
    setOpen(allCardsExpanded)
  }, [allCardsExpanded])

  useEffect(() => {
    setMotivoDraft(error.motivo ?? "")
  }, [error.motivo])

  if (!error) return null

  const style = getStatusStyle(error.error_status)
  const statusColor = availableStatuses?.find((s) => s.name === error.error_status)?.color
  const borderStyle = statusColor
    ? { borderColor: statusColor, borderWidth: "2px" }
    : {}

  const subjectName = error.topics?.subjects?.name ?? "Sem matéria"
  const topicName = error.topics?.name ?? "Sem tema"
  const errorTypeLabel = error.error_type ? `Erro de ${error.error_type}` : "Erro"
  const recurrence = Math.max(1, Number(error.recurrence_count ?? 1))
  const learning = (error.learning_status as LearningStatus) || null

  async function saveMotivo() {
    if (!onMotivoSave) return
    setSavingMotivo(true)
    try {
      await onMotivoSave(error.id, motivoDraft.trim())
      setEditingMotivo(false)
    } finally {
      setSavingMotivo(false)
    }
  }

  return (
    <div
      className={`relative rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${!statusColor ? style.border : ""}`}
      style={borderStyle}
    >
      <div className="mb-2 flex items-start justify-between gap-2 min-w-0">
        <div className="flex flex-1 flex-col gap-1 min-w-0 overflow-hidden">
          <h3 className="truncate text-sm font-semibold text-slate-800" title={topicName}>
            {topicName}
          </h3>
          <p
            className="truncate text-xs text-slate-500"
            title={`${subjectName} – ${errorTypeLabel}`}
          >
            {subjectName} – {errorTypeLabel}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {learning && (
              <span
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                title={
                  learning === "consolidado" ? CONSOLIDATED_STATUS_HINT : undefined
                }
              >
                {LEARNING_STATUS_LABELS[learning] ?? learning}
              </span>
            )}
            {recurrence > 1 && (
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-900">
                Reincidente · {recurrence}×
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
          <div className="relative shrink-0">
            {onStatusChange && availableStatuses.length > 0 ? (
              <>
                <button
                  onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                  className={`cursor-pointer whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium transition hover:opacity-80 ${statusColor ? "" : style.badge}`}
                  style={
                    statusColor
                      ? { backgroundColor: statusColor, color: "#ffffff" }
                      : {}
                  }
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
                      {availableStatuses.map((status) => (
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
                style={
                  statusColor
                    ? { backgroundColor: statusColor, color: "#ffffff" }
                    : {}
                }
              >
                {style.label}
              </span>
            )}
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded-md p-1 text-slate-700 hover:bg-slate-100"
            title="Visualizar"
          >
            <Eye size={16} />
          </button>

          {reviewMode && onMarkReviewed && (
            <button
              onClick={() => onMarkReviewed(error.id)}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-green-700"
              title="Marcar como revisado"
            >
              <CheckCircle2 size={14} />
              <span className="hidden sm:inline">Revisado</span>
            </button>
          )}

          <div className="shrink-0">
            <ErrorOptionsMenu onEdit={onEdit} onDelete={onDeleted} />
          </div>
        </div>
      </div>

      {error.knowledge_summary && (
        <p className="mb-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Conhecimento:</span>{" "}
          {error.knowledge_summary}
        </p>
      )}

      <div className="mt-3">
        <p className="text-xs font-semibold text-red-600">Erro</p>
        <div
          className="prose prose-sm max-w-none break-words text-sm leading-relaxed text-slate-800"
          dangerouslySetInnerHTML={{ __html: error.error_text }}
        />
      </div>

      <div className="mt-3 space-y-1 text-[11px] text-slate-500">
        <p>Última revisão: {formatDate(error.last_reviewed_at)}</p>
        <p>Próxima revisão: {formatDate(error.next_review_at)}</p>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-green-50 p-3">
            <p className="mb-2 text-xs font-semibold text-green-700">Correção</p>
            <div
              className="prose prose-sm max-w-none break-words text-sm leading-relaxed text-slate-800"
              dangerouslySetInnerHTML={{ __html: error.correction_text }}
            />
          </div>

          {error.explanation && (
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="mb-1 text-xs font-semibold text-blue-800">Explicação</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {error.explanation}
              </p>
            </div>
          )}

          <div className="rounded-lg bg-amber-50 p-3">
            <p className="mb-1 text-xs font-semibold text-amber-900">Motivo do erro</p>
            {editingMotivo ? (
              <div className="space-y-2">
                <textarea
                  className="w-full rounded border border-amber-200 bg-white p-2 text-sm"
                  rows={2}
                  value={motivoDraft}
                  onChange={(e) => setMotivoDraft(e.target.value)}
                  placeholder="Ex.: confundi anulação com revogação"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingMotivo}
                    onClick={saveMotivo}
                    className="rounded bg-amber-800 px-2.5 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMotivo(false)
                      setMotivoDraft(error.motivo ?? "")
                    }}
                    className="rounded px-2.5 py-1 text-xs text-slate-600"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : error.motivo ? (
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-slate-800">{error.motivo}</p>
                {onMotivoSave && (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-amber-800 underline"
                    onClick={() => setEditingMotivo(true)}
                  >
                    Editar
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="text-sm text-amber-900 underline"
                onClick={() => onMotivoSave && setEditingMotivo(true)}
              >
                Motivo não informado — adicionar
              </button>
            )}
          </div>

          {learning === "consolidado" && (
            <p className="text-xs text-slate-500">{CONSOLIDATED_STATUS_HINT}</p>
          )}

          {error.description && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold text-slate-600">Descrição</p>
              <div
                className="prose prose-sm max-w-none text-sm leading-relaxed text-slate-700"
                dangerouslySetInnerHTML={{ __html: error.description }}
              />
            </div>
          )}

          {error.reference_link && (
            <div className="pt-2">
              <a
                href={
                  error.reference_link.startsWith("http://") ||
                  error.reference_link.startsWith("https://")
                    ? error.reference_link
                    : `https://${error.reference_link}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 transition hover:text-blue-700 hover:underline"
              >
                Ir para questão
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
