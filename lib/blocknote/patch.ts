import type { StoredNotebookDocument, BlockNotePatchOp, StudyNotebookBlock } from "./types"

export function applyBlockNotePatches(
  doc: StoredNotebookDocument,
  ops: BlockNotePatchOp[]
): StoredNotebookDocument {
  let blocks: StudyNotebookBlock[] = [...doc.blocks]

  for (const op of ops) {
    if (op.op === "add") {
      const idx = op.afterBlockId
        ? blocks.findIndex((b) => b.id === op.afterBlockId) + 1
        : blocks.length
      blocks = [...blocks.slice(0, idx), op.block, ...blocks.slice(idx)]
    } else if (op.op === "update") {
      blocks = blocks.map((b) =>
        b.id === op.blockId
          ? ({ ...b, ...op.update } as StudyNotebookBlock)
          : b
      )
    } else if (op.op === "remove") {
      blocks = blocks.filter((b) => b.id !== op.blockId)
    }
  }

  return { version: 2, blocks }
}
