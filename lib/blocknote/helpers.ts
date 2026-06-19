import type { PartialBlock } from "@blocknote/core"
import type { StudyNotebookBlock } from "./types"

export function textToInline(text: string | undefined) {
  if (!text) return undefined
  return [{ type: "text" as const, text, styles: {} }]
}

export function parseJsonProp<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function stringifyJsonProp(value: unknown): string {
  return JSON.stringify(value)
}

export function emptyNotebookDocument(): {
  version: 2
  blocks: StudyNotebookBlock[]
} {
  return {
    version: 2,
    blocks: [{ type: "paragraph" }],
  }
}

export function isStoredNotebookDocument(
  doc: unknown
): doc is { version: 2; blocks: PartialBlock[] } {
  return (
    typeof doc === "object" &&
    doc !== null &&
    (doc as { version?: number }).version === 2 &&
    Array.isArray((doc as { blocks?: unknown }).blocks)
  )
}
