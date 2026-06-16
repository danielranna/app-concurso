"use client"

import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

type Props = {
  open: boolean
  pendingCount: number
  completedCount: number
  resetDayIndex: boolean
  onResetDayIndexChange: (v: boolean) => void
  onConfirm: () => void
  onClose: () => void
  loading?: boolean
}

export default function RegenerateConfirmModal({
  open,
  pendingCount,
  completedCount,
  resetDayIndex,
  onResetDayIndexChange,
  onConfirm,
  onClose,
  loading,
}: Props) {
  if (!open) return null

  const total = pendingCount + completedCount

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Regenerar calendário completo?
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Isso recria todas as {total} sessões do calendário. O progresso da fila
          será perdido.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          <li>
            <span className="font-medium text-emerald-700">
              {completedCount}
            </span>{" "}
            concluídas serão apagadas
          </li>
          <li>
            <span className="font-medium text-slate-800">{pendingCount}</span>{" "}
            pendentes serão recriadas
          </li>
        </ul>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={resetDayIndex}
            onChange={(e) => onResetDayIndexChange(e.target.checked)}
            className="rounded border-slate-300"
          />
          Recomeçar do dia 1 do ciclo
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Regenerar
          </Button>
        </div>
      </div>
    </div>
  )
}
