"use client"

import { useMemo } from "react"
import { BlockNoteView } from "@blocknote/ariakit"
import { useCreateBlockNote } from "@blocknote/react"
import "@blocknote/core/style.css"
import "@blocknote/ariakit/style.css"
import "@blocknote/react/style.css"
import type { StoredNotebookDocument } from "@/lib/blocknote/types"
import { studyNotebookSchema } from "@/lib/blocknote/schema"

type Props = {
  document: StoredNotebookDocument
}

export default function StudyNotebookViewer({ document }: Props) {
  const initialContent = useMemo(() => document.blocks, [document.blocks])

  const editor = useCreateBlockNote({
    schema: studyNotebookSchema,
    initialContent,
  })

  return (
    <div className="study-notebook-viewer canvas-doc">
      <BlockNoteView
        editor={editor}
        theme="light"
        editable={false}
        formattingToolbar={false}
        sideMenu={false}
        slashMenu={false}
        linkToolbar={false}
        tableHandles={false}
        filePanel={false}
        emojiPicker={false}
      />
    </div>
  )
}
