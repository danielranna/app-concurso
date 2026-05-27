import type { ConfidenceLevel } from "./question-types"

export type QuestionDraft = {
  selectedAnswer: string | null
  eliminated: string[]
  confidence: ConfidenceLevel
  durationMsAccumulated: number
  tec_id?: number
  notebook_id?: string
  resolved?: boolean
  result?: {
    is_correct: boolean
    correct_answer: string
    tec_url?: string
    outcome_category?: string
  }
}

const memoryStore = new Map<string, Record<string, QuestionDraft>>()

function emptyDraft(): QuestionDraft {
  return {
    selectedAnswer: null,
    eliminated: [],
    confidence: "seguro",
    durationMsAccumulated: 0,
  }
}

export function loadAllDrafts(scopeKey: string): Record<string, QuestionDraft> {
  if (typeof window === "undefined") {
    return memoryStore.get(scopeKey) ?? {}
  }
  try {
    const raw = sessionStorage.getItem(scopeKey)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, QuestionDraft>
  } catch {
    return memoryStore.get(scopeKey) ?? {}
  }
}

export function saveAllDrafts(
  scopeKey: string,
  drafts: Record<string, QuestionDraft>
): void {
  if (typeof window === "undefined") {
    memoryStore.set(scopeKey, drafts)
    return
  }
  try {
    sessionStorage.setItem(scopeKey, JSON.stringify(drafts))
  } catch {
    memoryStore.set(scopeKey, drafts)
  }
}

export function getDraft(scopeKey: string, questionId: string): QuestionDraft {
  const all = loadAllDrafts(scopeKey)
  return all[questionId] ?? emptyDraft()
}

export function setDraft(
  scopeKey: string,
  questionId: string,
  draft: QuestionDraft
): void {
  const all = loadAllDrafts(scopeKey)
  all[questionId] = draft
  saveAllDrafts(scopeKey, all)
}

export function listResolvableDrafts(
  scopeKey: string
): { questionId: string; draft: QuestionDraft }[] {
  const all = loadAllDrafts(scopeKey)
  return Object.entries(all)
    .filter(
      ([, d]) => d.selectedAnswer && !d.resolved
    )
    .map(([questionId, draft]) => ({ questionId, draft }))
}

export function draftScopeKey(
  mode: "notebook" | "study" | "solo",
  id: string
): string {
  if (mode === "notebook") return `draft:notebook:${id}`
  if (mode === "study") return `draft:session:${id}`
  return `draft:solo:${id}`
}

export function clearDraftScope(scopeKey: string): void {
  if (typeof window === "undefined") {
    memoryStore.delete(scopeKey)
    return
  }
  try {
    sessionStorage.removeItem(scopeKey)
  } catch {
    memoryStore.delete(scopeKey)
  }
}
