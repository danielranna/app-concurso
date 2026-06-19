"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import MateriaSubNav from "@/components/materias/MateriaSubNav"

export default function MateriaSubjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const subjectId = params.subjectId as string
  const [subjectName, setSubjectName] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      fetch(`/api/subjects?user_id=${user.id}`)
        .then((r) => r.json())
        .then((subs) => {
          const sub = (subs ?? []).find((s: { id: string }) => s.id === subjectId)
          setSubjectName(sub?.name ?? "Matéria")
        })
    })
  }, [subjectId])

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
          {subjectName || "…"}
        </h1>
      </header>
      <MateriaSubNav subjectId={subjectId} />
      {children}
    </div>
  )
}
