"use client"

import { useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import {
  fetchIngestQueueStatus,
  tickSerialIngestWorker,
  withGlobalIngestLock,
} from "@/lib/coach-ingest-worker-client"

const POLL_MS = 6_000

/**
 * Fila global de indexação: um PDF (uma etapa) por vez, todas as matérias.
 * Roda em qualquer página do Coach; só uma aba do navegador executa por vez.
 */
export default function GlobalDocumentIngestWorker() {
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        userIdRef.current = session?.user?.id ?? null
      }
    )

    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) userIdRef.current = user?.id ?? null
    })

    const tick = async () => {
      const userId = userIdRef.current
      if (!userId || cancelled) return

      try {
        const status = await fetchIngestQueueStatus(userId)
        if (!status.active) return

        await withGlobalIngestLock(async () => {
          await tickSerialIngestWorker(userId)
        })
      } catch {
        /* próximo ciclo */
      }
    }

    void tick()
    const interval = setInterval(() => void tick(), POLL_MS)

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
      clearInterval(interval)
    }
  }, [])

  return null
}
