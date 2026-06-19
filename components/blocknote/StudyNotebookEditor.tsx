"use client"

import { useMemo } from "react"
import { BlockNoteView } from "@blocknote/ariakit"
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react"
import "@blocknote/core/style.css"
import "@blocknote/ariakit/style.css"
import "@blocknote/react/style.css"
import type { StoredNotebookDocument } from "@/lib/blocknote/types"
import { studyNotebookSchema } from "@/lib/blocknote/schema"
import { getStudySlashMenuItems } from "@/lib/blocknote/slash-menu"

type Props = {
  document: StoredNotebookDocument
  onChange: (doc: StoredNotebookDocument) => void
}

export default function StudyNotebookEditor({ document, onChange }: Props) {
  const initialContent = useMemo(() => document.blocks, [document.blocks])

  const editor = useCreateBlockNote({
    schema: studyNotebookSchema,
    initialContent,
    placeholders: {
      default: "Digite '/' para inserir blocos",
      emptyDocument: "Digite '/' para inserir blocos",
    },
  })

  return (
    <div className="study-notebook-editor canvas-doc">
      <BlockNoteView
        editor={editor}
        theme="light"
        editable
        slashMenu={false}
        onChange={() => {
          onChange({ version: 2, blocks: editor.document })
        }}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => {
            const items = getStudySlashMenuItems(editor)
            if (!query) return items
            const q = query.toLowerCase()
            return items.filter(
              (item) =>
                item.title.toLowerCase().includes(q) ||
                item.aliases?.some((a) => a.toLowerCase().includes(q))
            )
          }}
        />
      </BlockNoteView>
    </div>
  )
}
