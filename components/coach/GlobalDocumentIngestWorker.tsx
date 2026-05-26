"use client"

import { useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import {
  fetchIngestQueueDetails,
  tickSerialIngestWorker,
} from "@/lib/coach-ingest-worker-client"

const POLL_MS = 2_000

/**
 * Processa a fila global de indexação (1 etapa por vez).
 * Sem lock entre abas — o servidor serializa e desbloqueia jobs travados.
 */
export default function GlobalDocumentIngestWorker() {
  const userIdRef = useRef<string | null>(null)
  const busyRef = useRef(false)

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
      if (!userId || cancelled || busyRef.current) return

      try {
        const status = await fetchIngestQueueDetails(userId, 1)
        if (!status.active) return

        busyRef.current = true
        await tickSerialIngestWorker(userId)
      } catch {
        /* próximo ciclo */
      } finally {
        busyRef.current = false
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
