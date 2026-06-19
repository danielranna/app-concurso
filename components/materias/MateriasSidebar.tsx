"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type SubjectRow = { id: string; name: string }

export default function MateriasSidebar() {
  const pathname = usePathname()
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [loading, setLoading] = useState(true)

  const activeSubjectId = pathname.match(/^\/materias\/([^/]+)/)?.[1] ?? null

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setLoading(false)
        return
      }
      fetch(`/api/subjects?user_id=${user.id}`)
        .then((r) => r.json())
        .then((d) => setSubjects(d ?? []))
        .finally(() => setLoading(false))
    })
  }, [])

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-slate-50 lg:w-56 lg:border-b-0 lg:border-r">
      <div className="border-b border-slate-200 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Matérias
        </p>
      </div>
      <nav className="max-h-48 overflow-y-auto lg:max-h-none lg:flex-1 lg:overflow-y-auto">
        {loading ? (
          <p className="px-3 py-4 text-sm text-slate-500">Carregando…</p>
        ) : subjects.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">
            Cadastre matérias em Configurações ou no mapa de erros.
          </p>
        ) : (
          <ul className="py-1">
            {subjects.map((s) => {
              const active = activeSubjectId === s.id
              return (
                <li key={s.id}>
                  <Link
                    href={`/materias/${s.id}`}
                    className={`block truncate px-3 py-2 text-sm transition ${
                      active
                        ? "bg-teal-50 font-medium text-teal-800"
                        : "text-slate-700 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    {s.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </nav>
    </aside>
  )
}
