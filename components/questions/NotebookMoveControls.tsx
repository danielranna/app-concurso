"use client"

import { useState } from "react"
import MoveNotebookModal from "@/components/questions/MoveNotebookModal"
import { moveNotebookLocation } from "@/lib/notebook-bulk-actions"

type Folder = { id: string; name: string }

type Props = {
  userId: string
  notebookId: string
  notebookName: string
  subjectId: string
  currentFolderId?: string | null
  folders: Folder[]
  onMoved: () => void
  /** Dentro de subpasta: opção de voltar para raiz da mesma matéria */
  showSameSubjectRoot?: boolean
}

export default function NotebookMoveControls({
  userId,
  notebookId,
  notebookName,
  subjectId,
  currentFolderId,
  folders,
  onMoved,
  showSameSubjectRoot = false,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  const localFolders = folders.filter((f) => f.id !== currentFolderId)
  const hasQuickOptions = showSameSubjectRoot || localFolders.length > 0

  async function quickMove(target: string) {
    if (target === "__other__") {
      setModalOpen(true)
      return
    }
    const folderId = target === "__root__" ? null : target
    await moveNotebookLocation(notebookId, subjectId, folderId)
    onMoved()
  }

  return (
    <>
      {hasQuickOptions ? (
        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            void quickMove(v)
            e.target.value = ""
          }}
          className="rounded border px-2 py-1.5 text-xs text-slate-600"
          aria-label="Mover caderno"
        >
          <option value="">Mover para…</option>
          {showSameSubjectRoot && <option value="__root__">Raiz desta matéria</option>}
          {localFolders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
          <option value="__other__">Outra pasta…</option>
        </select>
      ) : (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded border px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Mover para outra pasta…
        </button>
      )}

      <MoveNotebookModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        userId={userId}
        notebookId={notebookId}
        notebookName={notebookName}
        initialSubjectId={subjectId}
        initialFolderId={currentFolderId}
        onMoved={onMoved}
      />
    </>
  )
}
