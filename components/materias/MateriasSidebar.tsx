"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Library,
  Search,
  X,
} from "lucide-react"
import { supabase } from "@/lib/supabase"

type SubjectRow = { id: string; name: string }

type Props = {
  collapsed: boolean
  mobileOpen: boolean
  onToggleCollapse: () => void
  onCloseMobile: () => void
}

export default function MateriasSidebar({
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
}: Props) {
  const pathname = usePathname()
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  const activeSubjectId = pathname.match(/^\/materias\/([^/]+)/)?.[1] ?? null
  const expanded = mobileOpen || !collapsed

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return subjects
    return subjects.filter((s) => s.name.toLowerCase().includes(q))
  }, [subjects, query])

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

  const asideClass = [
    "flex shrink-0 flex-col border-slate-200/80 bg-white transition-[width,transform] duration-200 ease-out",
    "fixed inset-y-0 z-50 lg:sticky lg:top-0 lg:z-auto lg:h-[calc(100vh-5rem)]",
    mobileOpen ? "translate-x-0" : "-translate-x-full",
    "lg:translate-x-0",
    expanded ? "w-[min(100vw-3rem,17rem)] border-r shadow-xl lg:shadow-none" : "w-14 border-r",
    "lg:rounded-xl lg:border",
  ].join(" ")

  return (
    <aside className={asideClass} aria-label="Lista de matérias">
      {/* Header */}
      <div
        className={`flex shrink-0 items-center border-b border-slate-100 ${
          expanded ? "justify-between gap-2 px-3 py-3" : "justify-center px-2 py-3"
        }`}
      >
        {expanded ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Library className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">Matérias</p>
                <p className="text-[11px] text-slate-500">
                  {subjects.length} cadastrada{subjects.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={onCloseMobile}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onToggleCollapse}
                className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:block"
                aria-label="Recolher lista"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            title="Expandir matérias"
            aria-label="Expandir lista de matérias"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search */}
      {expanded && (
        <div className="shrink-0 border-b border-slate-100 px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar matéria…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/80 py-2 pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-900/5"
            />
          </div>
        </div>
      )}

      {/* List */}
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
        {!expanded ? (
          <ul className="flex flex-col items-center gap-1 px-1.5">
            {subjects.slice(0, 12).map((s) => {
              const active = activeSubjectId === s.id
              return (
                <li key={s.id}>
                  <Link
                    href={`/materias/${s.id}`}
                    title={s.name}
                    onClick={onCloseMobile}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold transition ${
                      active
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {s.name.charAt(0).toUpperCase()}
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : loading ? (
          <div className="space-y-2 px-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm leading-relaxed text-slate-500">
            {query
              ? "Nenhuma matéria encontrada."
              : "Cadastre matérias no mapa de erros ou nas configurações."}
          </p>
        ) : (
          <ul className="space-y-0.5 px-2">
            {filtered.map((s) => {
              const active = activeSubjectId === s.id
              return (
                <li key={s.id}>
                  <Link
                    href={`/materias/${s.id}`}
                    onClick={onCloseMobile}
                    className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                      active
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <BookMarked
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-slate-300" : "text-slate-400 group-hover:text-slate-600"
                      }`}
                    />
                    <span className="min-w-0 truncate font-medium">{s.name}</span>
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
