"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  AlertCircle,
  BookOpen,
  HelpCircle,
  Layers,
  LayoutDashboard,
  Sparkles,
} from "lucide-react"

type Props = {
  subjectId: string
}

const TABS = [
  { slug: "", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { slug: "caderno", label: "Caderno", icon: BookOpen },
  { slug: "erros-ia", label: "Erros IA", icon: Sparkles },
  { slug: "flashcards", label: "Flashcards", icon: Layers },
  { slug: "erros", label: "Mapa de erros", icon: AlertCircle },
  { slug: "questoes", label: "Questões", icon: HelpCircle },
] as const

export default function MateriaSubNav({ subjectId }: Props) {
  const pathname = usePathname()
  const base = `/materias/${subjectId}`

  return (
    <nav
      className="mb-6 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Seções da matéria"
    >
      <div className="inline-flex min-w-full gap-1 rounded-xl border border-slate-200/80 bg-slate-100/60 p-1 sm:min-w-0">
        {TABS.map((tab) => {
          const { slug, label, icon: Icon } = tab
          const exact = "exact" in tab && tab.exact
          const href = slug ? `${base}/${slug}` : base
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={slug || "overview"}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                active
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-slate-700" : "text-slate-400"}`} />
              <span className="whitespace-nowrap">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
