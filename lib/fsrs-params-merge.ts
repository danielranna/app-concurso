import type { FSRSParameters } from "ts-fsrs"
import {
  DEFAULT_FSRS_PARAMS,
  DEFAULT_REQUEST_RETENTION,
  type UserFsrsSettings,
} from "./flashcard-types"

export const RETENTION_MIN = 0.8
export const RETENTION_MAX = 0.95

/** Merge FSRS params: later sources override earlier ones. */
export function mergeFsrsParams(
  ...sources: Array<Partial<FSRSParameters> | UserFsrsSettings | null | undefined>
): Partial<FSRSParameters> {
  const merged: Partial<FSRSParameters> = { ...DEFAULT_FSRS_PARAMS }
  for (const src of sources) {
    if (!src) continue
    Object.assign(merged, src)
  }
  if (merged.request_retention != null) {
    merged.request_retention = clampRetention(merged.request_retention)
  }
  return merged
}

export function clampRetention(value: number): number {
  return Math.min(RETENTION_MAX, Math.max(RETENTION_MIN, value))
}

export { DEFAULT_REQUEST_RETENTION }
