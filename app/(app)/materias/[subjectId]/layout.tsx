"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ChevronRight, Library } from "lucide-react"
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
    <div className="space-y-1">
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
        <Link
          href="/materias"
          className="flex items-center gap-1 rounded-md px-1 py-0.5 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <Library className="h-3.5 w-3.5" />
          Matérias
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
        <span className="truncate font-medium text-slate-700">{subjectName || "…"}</span>
      </nav>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {subjectName || "…"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Desempenho, cadernos, erros e estudo em um só lugar.
        </p>
      </header>

      <MateriaSubNav subjectId={subjectId} />

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
        {children}
      </div>
    </div>
  )
}
