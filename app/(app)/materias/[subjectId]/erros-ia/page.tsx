"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import SubjectDossierPanel from "@/components/coach/SubjectDossierPanel"
import MateriaErrorNotebookCanvas from "@/components/materias/MateriaErrorNotebookCanvas"

export default function MateriaErrosIaPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  const [userId, setUserId] = useState<string | null>(null)
  const [subjectName, setSubjectName] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      fetch(`/api/subjects?user_id=${user.id}`)
        .then((r) => r.json())
        .then((subs) => {
          const sub = (subs ?? []).find((s: { id: string }) => s.id === subjectId)
          setSubjectName(sub?.name ?? "Matéria")
        })
    })
  }, [subjectId])

  if (!userId) return <p className="text-slate-500">Carregando…</p>

  return (
    <div className="space-y-6">
      <MateriaErrorNotebookCanvas
        userId={userId}
        subjectId={subjectId}
        subjectName={subjectName}
      />
      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
          Relatório narrativo (legado)
        </summary>
        <div className="border-t border-slate-100 p-4">
          <SubjectDossierPanel
            userId={userId}
            subjectId={subjectId}
            subjectName={subjectName}
          />
        </div>
      </details>
    </div>
  )
}
