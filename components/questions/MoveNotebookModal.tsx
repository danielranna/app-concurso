"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"
import NotebookFolderSelect from "@/components/questions/NotebookFolderSelect"

type Subject = { id: string; name: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  userId: string
  notebookId: string
  notebookName: string
  initialSubjectId?: string | null
  initialFolderId?: string | null
  onMoved: () => void
}

export async function moveNotebookLocation(
  notebookId: string,
  subjectId: string,
  folderId: string | null
) {
  const res = await fetch(`/api/notebooks/${notebookId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject_id: subjectId,
      folder_id: folderId,
    }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error ?? "Erro ao mover caderno")
  }
}

export default function MoveNotebookModal({
  isOpen,
  onClose,
  userId,
  notebookId,
  notebookName,
  initialSubjectId,
  initialFolderId,
  onMoved,
}: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? "")
  const [folderId, setFolderId] = useState(initialFolderId ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setSubjectId(initialSubjectId ?? "")
    setFolderId(initialFolderId ?? "")
    setError(null)
    fetch(`/api/subjects?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => setSubjects(Array.isArray(d) ? d : []))
  }, [isOpen, userId, initialSubjectId, initialFolderId])

  if (!isOpen) return null

  async function handleMove() {
    if (!subjectId) {
      setError("Escolha uma matéria")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await moveNotebookLocation(notebookId, subjectId, folderId || null)
      onMoved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao mover")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mover para outra pasta</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          <span className="font-medium text-slate-800">{notebookName}</span>
        </p>
        <label className="mb-3 block text-sm">
          <span className="font-medium text-slate-700">Matéria</span>
          <select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value)
              setFolderId("")
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Selecione…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {subjectId && (
          <NotebookFolderSelect
            userId={userId}
            subjectId={subjectId}
            value={folderId}
            onChange={setFolderId}
            className="mb-3 block text-sm"
            selectClassName="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        )}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={saving || !subjectId}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Mover
          </button>
        </div>
      </div>
    </div>
  )
}
