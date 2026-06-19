import type { CanvasBlock, CanvasDocument, CalloutVariant } from "@/lib/canvas-blocks/types"
import { stringifyJsonProp, textToInline } from "./helpers"
import type { StoredNotebookDocument, StudyNotebookBlock } from "./types"

function migrateBlock(block: CanvasBlock): StudyNotebookBlock[] {
  const p = block.props

  switch (block.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, (p.level as number) ?? 2))
      return [
        {
          type: "heading",
          props: { level },
          content: textToInline(p.text as string),
        },
      ]
    }
    case "paragraph":
      return [{ type: "paragraph", content: textToInline(p.text as string) }]
    case "divider":
      return [{ type: "divider" }]
    case "callout":
      return [
        {
          type: "studyAlert",
          props: {
            variant: ((p.variant as string) ?? "dica") as CalloutVariant,
            title: (p.title as string) ?? "",
          },
          content: textToInline(p.body as string),
        },
      ]
    case "chapter_header":
      return [
        {
          type: "chapterHeader",
          props: {
            numeral: (p.numeral as string) ?? "I",
            period: (p.period as string) ?? "",
            title: (p.title as string) ?? "",
          },
        },
      ]
    case "timeline":
      return [
        {
          type: "timeline",
          props: {
            itemsJson: stringifyJsonProp(
              (p.items as { date: string; content: string }[]) ?? []
            ),
          },
        },
      ]
    case "mini_cards":
      return [
        {
          type: "miniCards",
          props: {
            cardsJson: stringifyJsonProp(
              (p.cards as { title: string; body: string }[]) ?? []
            ),
          },
        },
      ]
    case "table":
      return [
        {
          type: "tableCompare",
          props: {
            headersJson: stringifyJsonProp((p.headers as string[]) ?? []),
            rowsJson: stringifyJsonProp((p.rows as string[][]) ?? []),
          },
        },
      ]
    case "checklist": {
      const items = (p.items as { text: string; checked: boolean }[]) ?? []
      return items.map((item) => ({
        type: "checkListItem" as const,
        props: { checked: item.checked },
        content: textToInline(item.text),
      }))
    }
    case "numbered_list": {
      const items = (p.items as string[]) ?? []
      return items.map((text) => ({
        type: "numberedListItem" as const,
        content: textToInline(text),
      }))
    }
    case "accordion":
      return [
        {
          type: "studyAccordion",
          props: {
            itemsJson: stringifyJsonProp(
              (p.items as { title: string; body: string }[]) ?? []
            ),
          },
        },
      ]
    case "quote":
      return [{ type: "quote", content: textToInline(p.text as string) }]
    case "formula":
      return [
        {
          type: "paragraph",
          content: textToInline((p.text as string) ?? ""),
        },
      ]
    case "code":
      return [
        {
          type: "codeBlock",
          props: { language: (p.language as string) ?? "" },
          content: textToInline(p.code as string),
        },
      ]
    case "bar_chart":
      return [
        {
          type: "barChart",
          props: {
            title: (p.title as string) ?? "",
            itemsJson: stringifyJsonProp(
              (p.items as { label: string; value: number }[]) ?? []
            ),
          },
        },
      ]
    case "sketch":
      return [{ type: "sketchPad", props: { dataUrl: "" } }]
    case "pills": {
      const items = (p.items as string[]) ?? []
      return [
        {
          type: "arrowList",
          props: { itemsJson: stringifyJsonProp(items) },
        },
      ]
    }
    case "section": {
      const out: StudyNotebookBlock[] = [
        {
          type: "studySection",
          props: { title: (p.title as string) ?? "" },
        },
      ]
      for (const child of block.children ?? []) {
        out.push(...migrateBlock(child))
      }
      return out
    }
    case "columns": {
      const out: StudyNotebookBlock[] = []
      for (const child of block.children ?? []) {
        out.push(...migrateBlock(child))
      }
      return out
    }
    default:
      return [
        {
          type: "paragraph",
          content: textToInline(JSON.stringify(p)),
        },
      ]
  }
}

export function canvasDocumentToBlockNote(
  doc: CanvasDocument
): StoredNotebookDocument {
  const blocks: StudyNotebookBlock[] = []
  for (const block of doc.blocks) {
    blocks.push(...migrateBlock(block))
  }
  if (blocks.length === 0) {
    blocks.push({ type: "paragraph" })
  }
  return { version: 2, blocks }
}

export function normalizeNotebookDocument(
  doc: unknown
): StoredNotebookDocument {
  if (
    typeof doc === "object" &&
    doc !== null &&
    (doc as { version?: number }).version === 2 &&
    Array.isArray((doc as { blocks?: unknown }).blocks)
  ) {
    return doc as StoredNotebookDocument
  }
  if (
    typeof doc === "object" &&
    doc !== null &&
    Array.isArray((doc as CanvasDocument).blocks)
  ) {
    return canvasDocumentToBlockNote(doc as CanvasDocument)
  }
  return { version: 2, blocks: [{ type: "paragraph" }] }
}

export function blockNoteToLegacyCanvas(
  doc: StoredNotebookDocument
): CanvasDocument {
  return {
    version: 1,
    blocks: doc.blocks.map((b, i) => ({
      id: `migrated_${i}`,
      type: "paragraph",
      props: { text: JSON.stringify(b) },
    })),
  }
}
