import type { PartialBlock } from "@blocknote/core"
import type { studyNotebookSchema } from "./schema"

export type StudyNotebookBlock = PartialBlock<
  typeof studyNotebookSchema.blockSchema,
  typeof studyNotebookSchema.inlineContentSchema,
  typeof studyNotebookSchema.styleSchema
>

export type StoredNotebookDocument = {
  version: 2
  blocks: StudyNotebookBlock[]
}

export type BlockNotePatchOp =
  | { op: "add"; afterBlockId?: string; block: StudyNotebookBlock }
  | { op: "update"; blockId: string; update: StudyNotebookBlock }
  | { op: "remove"; blockId: string }
