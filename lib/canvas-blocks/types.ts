export type BlockType =
  | "heading"
  | "paragraph"
  | "divider"
  | "section"
  | "columns"
  | "callout"
  | "chapter_header"
  | "timeline"
  | "mini_cards"
  | "pills"
  | "table"
  | "checklist"
  | "numbered_list"
  | "accordion"
  | "quote"
  | "formula"
  | "code"
  | "bar_chart"
  | "sketch"

export type CalloutVariant =
  | "atencao"
  | "dica"
  | "definicao"
  | "exemplo"
  | "pegadinha"
  | "info"
  | "prova"
  | "resumo"
  | "destaque"

export type HeadingLevel = 1 | 2 | 3

export type CanvasBlock = {
  id: string
  type: BlockType
  props: Record<string, unknown>
  children?: CanvasBlock[]
}

export type CanvasDocument = {
  blocks: CanvasBlock[]
  version: number
}

export type CanvasPatchOp =
  | { op: "add"; afterBlockId?: string; block: CanvasBlock }
  | { op: "update"; blockId: string; props: Record<string, unknown> }
  | { op: "remove"; blockId: string }

export function newBlockId(): string {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function emptyDocument(): CanvasDocument {
  return {
    version: 1,
    blocks: [
      {
        id: newBlockId(),
        type: "heading",
        props: { level: 2, text: "" },
      },
      {
        id: newBlockId(),
        type: "paragraph",
        props: { text: "" },
      },
    ],
  }
}
