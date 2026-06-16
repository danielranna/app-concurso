"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getStoredCycleId, setStoredCycleId } from "@/lib/cycle-plan-context"

export function useCyclePlanId() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromUrl = searchParams.get("cycle_id")
  const [cycleId, setCycleIdState] = useState<string | null>(fromUrl)

  useEffect(() => {
    if (fromUrl) {
      setStoredCycleId(fromUrl)
      setCycleIdState(fromUrl)
      return
    }
    const stored = getStoredCycleId()
    if (stored) setCycleIdState(stored)
  }, [fromUrl])

  const setCycleId = useCallback(
    (id: string | null, options?: { replaceUrl?: boolean }) => {
      setStoredCycleId(id)
      setCycleIdState(id)
      if (options?.replaceUrl !== false && typeof window !== "undefined") {
        const url = new URL(window.location.href)
        if (id) url.searchParams.set("cycle_id", id)
        else url.searchParams.delete("cycle_id")
        router.replace(url.pathname + url.search)
      }
    },
    [router]
  )

  return { cycleId, setCycleId }
}
