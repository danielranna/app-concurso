"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getStoredCycleId, setStoredCycleId } from "@/lib/cycle-plan-context"

export function useCyclePlanId() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromUrl = searchParams.get("cycle_id")
  const [cycleId, setCycleIdState] = useState<string | null>(fromUrl)
  const cycleIdRef = useRef(cycleId)
  cycleIdRef.current = cycleId

  useEffect(() => {
    if (fromUrl) {
      setStoredCycleId(fromUrl)
      if (fromUrl !== cycleIdRef.current) setCycleIdState(fromUrl)
      return
    }
    const stored = getStoredCycleId()
    if (stored && stored !== cycleIdRef.current) setCycleIdState(stored)
  }, [fromUrl])

  const setCycleId = useCallback(
    (id: string | null, options?: { replaceUrl?: boolean }) => {
      const current = cycleIdRef.current
      const urlId =
        typeof window !== "undefined"
          ? new URL(window.location.href).searchParams.get("cycle_id")
          : fromUrl
      const sameState = id === current
      const sameUrl = id === urlId || (!id && !urlId)

      if (sameState && sameUrl) {
        if (id) setStoredCycleId(id)
        return
      }

      setStoredCycleId(id)
      if (!sameState) setCycleIdState(id)

      if (options?.replaceUrl !== false && typeof window !== "undefined") {
        const url = new URL(window.location.href)
        if (id) url.searchParams.set("cycle_id", id)
        else url.searchParams.delete("cycle_id")
        const next = url.pathname + url.search
        const currentPath = window.location.pathname + window.location.search
        if (next !== currentPath) router.replace(next)
      }
    },
    [router, fromUrl]
  )

  return { cycleId, setCycleId }
}
