"use client"

import type { SetupDrift } from "@/lib/study-cycle-plans"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { useState } from "react"

type Props = {
  userId: string
  cycleId: string
  drift: SetupDrift | null
  onSynced: () => void
  onRegenerate?: () => void
}

export default function SetupDriftBanner({
  userId,
  cycleId,
  drift,
  onSynced,
  onRegenerate,
}: Props) {
  const [syncing, setSyncing] = useState(false)
  const [appending, setAppending] = useState(false)

  if (!drift?.has_drift) return null

  async function syncLight() {
    setSyncing(true)
    try {
      const res = await fetch("/api/ciclo/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "sync_schedule",
          cycle_id: cycleId,
        }),
      })
      const data = await res.json()
      if (!res.ok) alert(data.error ?? "Erro")
      else onSynced()
    } finally {
      setSyncing(false)
    }
  }

  async function appendNew() {
    setAppending(true)
    try {
      const res = await fetch("/api/ciclo/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "append_sessions",
          cycle_id: cycleId,
        }),
      })
      const data = await res.json()
      if (!res.ok) alert(data.error ?? "Erro")
      else {
        if (data.added === 0) alert("Nenhuma sessão nova para acrescentar.")
        onSynced()
      }
    } finally {
      setAppending(false)
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">O calendário não reflete o setup atual</p>
      <ul className="mt-1 list-inside list-disc text-xs text-amber-900/90">
        {drift.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800">
        {drift.completed_schedule_blocks} concluídas ·{" "}
        {drift.pending_schedule_blocks} pendentes
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={syncing}
          onClick={syncLight}
        >
          {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
          Sincronizar pendentes
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={appending}
          onClick={appendNew}
        >
          {appending && <Loader2 className="h-3 w-3 animate-spin" />}
          Acrescentar sessões novas
        </Button>
        {onRegenerate && (
          <Button type="button" size="sm" onClick={onRegenerate}>
            Regenerar completo…
          </Button>
        )}
      </div>
    </div>
  )
}
