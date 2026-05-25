"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ChevronRight } from "lucide-react"

type SubjectRow = {
  id: string
  name: string
}

export default function CoachMateriasPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState<SubjectRow[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      fetch(`/api/subjects?user_id=${user.id}`)
        .then((r) => r.json())
        .then((d) => setSubjects(d ?? []))
    })
  }, [router])

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Prioridades, fila estratégica, sinais e relatórios por matéria.
      </p>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {subjects.map((s) => (
          <li key={s.id}>
            <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-slate-900">{s.name}</span>
                <p className="text-xs text-slate-500">
                  PDFs, professor, fila e insights
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <Link
                  href={`/coach/materias/${s.id}/materiais`}
                  className="font-medium text-violet-700 hover:underline"
                >
                  Materiais
                </Link>
                <Link
                  href={`/coach/materias/${s.id}/insights`}
                  className="text-slate-600 hover:text-slate-900"
                  aria-label="Insights"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </li>
        ))}
        {!subjects.length && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            Cadastre matérias em Configurações ou no mapa de erros.
          </li>
        )}
      </ul>
    </div>
  )
}
