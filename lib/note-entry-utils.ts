export type NoteEntryLike = {
  id: string
  body: string
  ai_processed_at?: string | null
  ai_feedback?: string | null
  ai_classify?: Record<string, unknown> | null
}

export function splitPendingNoteEntries<T extends NoteEntryLike>(entries: T[]) {
  const pending: T[] = []
  const cached: T[] = []
  for (const e of entries) {
    if (e.ai_processed_at && (e.ai_feedback || e.ai_classify)) {
      cached.push(e)
    } else {
      pending.push(e)
    }
  }
  return { pending, cached }
}

export function combineNoteBodies<T extends { body: string }>(entries: T[]): string {
  return entries
    .map((e) => e.body.trim())
    .filter(Boolean)
    .join("\n---\n")
}

export function combinePendingNoteBodies<T extends NoteEntryLike>(entries: T[]): string {
  const { pending } = splitPendingNoteEntries(entries)
  return combineNoteBodies(pending)
}
