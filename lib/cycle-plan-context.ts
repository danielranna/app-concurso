"use client"

const STORAGE_KEY = "ciclo_selected_plan_id"

export function getStoredCycleId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(STORAGE_KEY)
}

export function setStoredCycleId(cycleId: string | null) {
  if (typeof window === "undefined") return
  if (cycleId) localStorage.setItem(STORAGE_KEY, cycleId)
  else localStorage.removeItem(STORAGE_KEY)
}

export function cycleQueryParam(cycleId: string | null | undefined): string {
  if (!cycleId) return ""
  return `cycle_id=${encodeURIComponent(cycleId)}`
}

export function withCycleId(path: string, cycleId: string | null | undefined): string {
  if (!cycleId) return path
  const sep = path.includes("?") ? "&" : "?"
  return `${path}${sep}cycle_id=${encodeURIComponent(cycleId)}`
}
