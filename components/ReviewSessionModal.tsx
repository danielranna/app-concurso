"use client"

import { X, PlayCircle, RotateCcw, XCircle } from "lucide-react"

type ReviewSession = {
  id: string
  filters: Record<string, unknown>
  card_ids: string[]
  reviewed_card_ids: string[]
  status: string
  created_at: string
  updated_at: string
}

type ReviewSessionModalProps = {
  isOpen: boolean
  session: ReviewSession | null
  totalCurrentCards: number
  onContinue: () => void
  onCancel: () => void
  onNewReview: () => void
  onClose: () => void
}

export default function ReviewSessionModal({
  isOpen,
  session,
  totalCurrentCards,
  onContinue,
  onCancel,
  onNewReview,
  onClose
}: ReviewSessionModalProps) {
  if (!isOpen || !session) return null

  const reviewedCount = session.reviewed_card_ids?.length || 0
  const totalCount = session.card_ids?.length || 0
  const remainingCount = totalCount - reviewedCount

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Revisão em Andamento
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info da sessão */}
        <div className="mb-6 space-y-3">
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-sm text-blue-700">
              Você tem uma revisão em andamento iniciada em{" "}
              <span className="font-semibold">{formatDate(session.created_at)}</span>
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="text-sm text-slate-600">Progresso:</span>
            <span className="font-semibold text-slate-800">
              {reviewedCount} / {totalCount} revisados
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="text-sm text-slate-600">Cards restantes:</span>
            <span className="font-semibold text-slate-800">
              {remainingCount}
            </span>
          </div>

          {/* Barra de progresso */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Ações */}
        <div className="space-y-2">
          <button
            onClick={onContinue}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <PlayCircle className="h-5 w-5" />
            Continuar Revisão ({remainingCount} restantes)
          </button>

          <button
            onClick={onNewReview}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <RotateCcw className="h-5 w-5" />
            Nova Revisão ({totalCurrentCards} cards)
          </button>

          <button
            onClick={onCancel}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <XCircle className="h-5 w-5" />
            Cancelar Revisão Atual
          </button>
        </div>
      </div>
    </div>
  )
}
