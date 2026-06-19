import type { CanvasDocument, CanvasPatchOp, CanvasBlock } from "./types"
import { newBlockId } from "./types"

export function applyCanvasPatches(
  doc: CanvasDocument,
  ops: CanvasPatchOp[]
): CanvasDocument {
  let blocks = [...doc.blocks]

  function applyToList(list: CanvasBlock[]): CanvasBlock[] {
    let result = [...list]
    for (const op of ops) {
      if (op.op === "add") {
        const idx = op.afterBlockId
          ? result.findIndex((b) => b.id === op.afterBlockId) + 1
          : result.length
        result = [...result.slice(0, idx), op.block, ...result.slice(idx)]
      } else if (op.op === "update") {
        result = result.map((b) =>
          b.id === op.blockId ? { ...b, props: { ...b.props, ...op.props } } : b
        )
      } else if (op.op === "remove") {
        result = result.filter((b) => b.id !== op.blockId)
      }
    }
    return result
  }

  blocks = applyToList(blocks)
  return { ...doc, blocks, version: doc.version + 1 }
}

export function findBlockIndex(blocks: CanvasBlock[], id: string): number {
  return blocks.findIndex((b) => b.id === id)
}

export function moveBlock(blocks: CanvasBlock[], from: number, to: number): CanvasBlock[] {
  if (from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return blocks
  const next = [...blocks]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function duplicateBlock(block: CanvasBlock): CanvasBlock {
  return {
    ...block,
    id: newBlockId(),
    children: block.children?.map(duplicateBlock),
  }
}
