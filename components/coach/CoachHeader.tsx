"use client"

import { useState } from "react"
import { Settings } from "lucide-react"
import CoachAiCredentialsModal from "./CoachAiCredentialsModal"

type Props = {
  onCredentialsChange?: () => void
}

export default function CoachHeader({ onCredentialsChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Coach IA</h1>
          <p className="mt-1 text-sm text-slate-500">
            Relatórios, prioridades e ações sugeridas
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <Settings className="h-4 w-4" />
          Chave de IA
        </button>
      </div>

      <CoachAiCredentialsModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          window.dispatchEvent(new Event("coach-ai-credentials-updated"))
          onCredentialsChange?.()
        }}
      />
    </>
  )
}
