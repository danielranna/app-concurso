"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, HelpCircle, Layers, Sparkles } from "lucide-react"

const links = [
  { href: "/erros", label: "Mapa de erros", icon: BookOpen },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/questoes", label: "Questões", icon: HelpCircle },
  { href: "/coach", label: "Coach IA", icon: Sparkles },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
      <p className="mb-6 text-sm font-semibold text-slate-500">Via Aprovação</p>
      <nav className="flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
