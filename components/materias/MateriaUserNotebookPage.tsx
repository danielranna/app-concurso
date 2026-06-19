"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { emptyNotebookDocument } from "@/lib/blocknote/helpers"
import type { StoredNotebookDocument } from "@/lib/blocknote/types"
import StudyNotebookEditor from "@/components/blocknote/StudyNotebookEditor"

type Props = {
  subjectId: string
}

export default function MateriaUserNotebookPage({ subjectId }: Props) {
  const [userId, setUserId] = useState<string | null>(null)
  const [document, setDocument] = useState<StoredNotebookDocument>(
    emptyNotebookDocument()
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    const res = await fetch(
      `/api/materias/${subjectId}/caderno?user_id=${uid}`
    )
    const data = await res.json()
    if (data.document) {
      setDocument(data.document)
      setEditorKey((k) => k + 1)
    }
    setLastSaved(data.updated_at ?? null)
    setLoading(false)
  }, [subjectId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      load(user.id)
    })
  }, [load])

  const persist = useCallback(
    async (doc: StoredNotebookDocument) => {
      if (!userId) return
      setSaving(true)
      const res = await fetch(`/api/materias/${subjectId}/caderno`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, document: doc }),
      })
      const data = await res.json()
      if (data.updated_at) setLastSaved(data.updated_at)
      setSaving(false)
    },
    [userId, subjectId]
  )

  function handleChange(doc: StoredNotebookDocument) {
    setDocument(doc)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(doc), 1000)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando caderno…
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Sua página de estudos personalizada. Digite &apos;/&apos; para inserir
          blocos (ex.: &quot;duas colunas&quot;, &quot;imagem&quot;). Cole imagens
          com Ctrl+V. As alterações são salvas automaticamente.
        </p>
        <span className="text-xs text-slate-400">
          {saving
            ? "Salvando…"
            : lastSaved
              ? `Salvo ${new Date(lastSaved).toLocaleString("pt-BR")}`
              : ""}
        </span>
      </div>
      <StudyNotebookEditor
        key={editorKey}
        document={document}
        onChange={handleChange}
      />
    </div>
  )
}
