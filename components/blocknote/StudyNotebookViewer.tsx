"use client"

import { useMemo } from "react"
import { BlockNoteViewRaw, useCreateBlockNote } from "@blocknote/react"
import "@blocknote/react/style.css"
import type { StoredNotebookDocument } from "@/lib/blocknote/types"
import { studyNotebookSchema } from "@/lib/blocknote/schema"

type Props = {
  document: StoredNotebookDocument
}

export default function StudyNotebookViewer({ document }: Props) {
  const initialContent = useMemo(() => document.blocks, [document.blocks])

  const editor = useCreateBlockNote(
    {
      schema: studyNotebookSchema,
      initialContent,
    },
    [document.blocks]
  )

  return (
    <div className="study-notebook-viewer canvas-doc">
      <BlockNoteViewRaw
        editor={editor}
        theme="light"
        editable={false}
        formattingToolbar={false}
        sideMenu={false}
        slashMenu={false}
      />
    </div>
  )
}
