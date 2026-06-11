"use client"

import { useState } from "react"
import { Loader2, X } from "lucide-react"
import type { ParsedTecQuestion } from "@/lib/question-types"

type Props = {
  question: ParsedTecQuestion
  onClose: () => void
  onSave: (merged: ParsedTecQuestion) => void
}

export default function ImportQuestionStatementModal({ question, onClose, onSave }: Props) {
  const [statement, setStatement] = useState(question.statement)
  const [saving, setSaving] = useState(false)

  function handleSave() {
    setSaving(true)
    onSave({ ...question, statement: statement.trim() })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Editar enunciado</h2>
            <p className="text-sm text-slate-500">
              #{question.index} · TEC {question.tec_id} — apague o texto compartilhado e deixe só o
              enunciado.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={14}
          className="w-full rounded-lg border px-3 py-2 font-mono text-sm leading-relaxed"
          placeholder="Enunciado da questão…"
        />
        <div className="mt-4 flex justify-end gap-2 border-t pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !statement.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
