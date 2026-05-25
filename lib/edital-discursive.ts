import { normLabel } from "./incidence-subject-map"

const DISCURSIVE_PATTERNS = [
  /\bdiscursiv/i,
  /\bprova\s+discursiv/i,
  /\bestudo\s+de\s+caso/i,
  /\bpeca\s+(processual|juridica)/i,
  /\brelatorio\b/i,
  /\bparecer\b/i,
]

/** Matérias de prova discursiva — não entram no ranking objetivo. */
export function isDiscursiveSubject(name: string): boolean {
  const n = normLabel(name)
  if (!n) return false
  if (n.includes("discursiv")) return true
  return DISCURSIVE_PATTERNS.some((re) => re.test(name))
}

import type { DiscursiveSubjectNote } from "./coach-types"
export type { DiscursiveSubjectNote }
