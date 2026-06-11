"use client"

import { useEffect, useState } from "react"

type Folder = { id: string; name: string }

type Props = {
  userId: string
  subjectId: string
  value: string
  onChange: (folderId: string) => void
  allowRoot?: boolean
  rootLabel?: string
  label?: string
  className?: string
  selectClassName?: string
}

export default function NotebookFolderSelect({
  userId,
  subjectId,
  value,
  onChange,
  allowRoot = true,
  rootLabel = "Raiz da matéria",
  label = "Subpasta (opcional)",
  className,
  selectClassName = "mt-1 w-full rounded border px-3 py-2 text-sm",
}: Props) {
  const [folders, setFolders] = useState<Folder[]>([])

  useEffect(() => {
    if (!userId || !subjectId) {
      setFolders([])
      return
    }
    fetch(`/api/notebooks/folders?user_id=${userId}&subject_id=${subjectId}&root_only=1`)
      .then((r) => r.json())
      .then((d) => setFolders(Array.isArray(d) ? d : []))
  }, [userId, subjectId])

  if (folders.length === 0) return null

  return (
    <label className={className ?? "block text-sm"}>
      <span className="font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClassName}
      >
        {allowRoot && <option value="">{rootLabel}</option>}
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export function useNotebookFolders(userId: string | null, subjectId: string) {
  const [folders, setFolders] = useState<Folder[]>([])

  useEffect(() => {
    if (!userId || !subjectId) {
      setFolders([])
      return
    }
    fetch(`/api/notebooks/folders?user_id=${userId}&subject_id=${subjectId}&root_only=1`)
      .then((r) => r.json())
      .then((d) => setFolders(Array.isArray(d) ? d : []))
  }, [userId, subjectId])

  return folders
}
