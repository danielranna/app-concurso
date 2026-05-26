export type QuestionContentBlockKind = "text" | "image"

export type QuestionContentBlock = {
  id: string
  kind: QuestionContentBlockKind
  /** HTML para texto; URL pública para imagem */
  content: string
}

export type QuestionContentBlocks = {
  before: QuestionContentBlock[]
  after: QuestionContentBlock[]
}

export function newBlockId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function emptyContentBlocks(): QuestionContentBlocks {
  return { before: [], after: [] }
}

export function isImageContent(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return false
  return (
    /^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(trimmed) ||
    trimmed.includes("/storage/v1/object/")
  )
}

function blockFromLegacyString(raw: string): QuestionContentBlock {
  const trimmed = raw.trim()
  if (isImageContent(trimmed)) {
    return { id: newBlockId(), kind: "image", content: trimmed }
  }
  return { id: newBlockId(), kind: "text", content: trimmed }
}

function normalizeBlock(b: unknown): QuestionContentBlock | null {
  if (!b || typeof b !== "object") return null
  const o = b as Record<string, unknown>
  const content = typeof o.content === "string" ? o.content.trim() : ""
  if (!content) return null
  const kind: QuestionContentBlockKind =
    o.kind === "image" || (o.kind !== "text" && isImageContent(content)) ? "image" : "text"
  const id = typeof o.id === "string" && o.id ? o.id : newBlockId()
  return { id, kind, content }
}

/** Converte campos legados ou JSON salvo em estrutura de blocos. */
export function resolveQuestionContentBlocks(input: {
  content_blocks?: QuestionContentBlocks | Record<string, unknown> | null
  content_before?: string | null
  content_after?: string | null
}): QuestionContentBlocks {
  const raw = input.content_blocks
  if (raw && typeof raw === "object" && Array.isArray(raw.before) && Array.isArray(raw.after)) {
    return {
      before: raw.before.map(normalizeBlock).filter((b): b is QuestionContentBlock => !!b),
      after: raw.after.map(normalizeBlock).filter((b): b is QuestionContentBlock => !!b),
    }
  }
  const before: QuestionContentBlock[] = []
  const after: QuestionContentBlock[] = []
  if (input.content_before?.trim()) before.push(blockFromLegacyString(input.content_before))
  if (input.content_after?.trim()) after.push(blockFromLegacyString(input.content_after))
  return { before, after }
}

export function contentBlocksAreEmpty(blocks: QuestionContentBlocks): boolean {
  return blocks.before.length === 0 && blocks.after.length === 0
}

export function stripEmptyBlocks(blocks: QuestionContentBlocks): QuestionContentBlocks {
  const keep = (b: QuestionContentBlock) => {
    const c = b.content.trim()
    if (!c || c === "<br>" || c === "<p><br></p>") return false
    return true
  }
  return {
    before: blocks.before.filter(keep),
    after: blocks.after.filter(keep),
  }
}
