"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"

type Subject = { id: string; name: string }
type Folder = { id: string; name: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  userId: string
  notebookId: string
  initialName: string
  initialSubjectId?: string | null
  onSaved: () => void
}

export default function SaveNotebookModal({
  isOpen,
  onClose,
  userId,
  notebookId,
  initialName,
  initialSubjectId,
  onSaved,
}: Props) {
  const [name, setName] = useState(initialName)
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? "")
  const [folderId, setFolderId] = useState("")
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setName(initialName)
    setSubjectId(initialSubjectId ?? "")
    setFolderId("")
    setError(null)
    fetch(`/api/subjects?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => setSubjects(Array.isArray(d) ? d : []))
  }, [isOpen, initialName, initialSubjectId, userId])

  useEffect(() => {
    if (!subjectId) {
      setFolders([])
      setFolderId("")
      return
    }
    fetch(`/api/notebooks/folders?user_id=${userId}&subject_id=${subjectId}&root_only=1`)
      .then((r) => r.json())
      .then((d) => setFolders(Array.isArray(d) ? d : []))
  }, [subjectId, userId])

  if (!isOpen) return null

  async function handleSave() {
    if (!name.trim() || !subjectId) {
      setError("Nome e matéria são obrigatórios")
      return
    }
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/notebooks/${notebookId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        subject_id: subjectId,
        folder_id: folderId || null,
        library_saved: true,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar")
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Salvar na biblioteca</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Este caderno foi gerado pelo plano do dia. Escolha onde guardá-lo na sua biblioteca.
        </p>
        <label className="mb-3 block text-sm">
          <span className="font-medium text-slate-700">Nome</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="mb-3 block text-sm">
          <span className="font-medium text-slate-700">Matéria</span>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
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
        {folders.length > 0 && (
          <label className="mb-3 block text-sm">
            <span className="font-medium text-slate-700">Pasta (opcional)</span>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Raiz da matéria</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
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
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
