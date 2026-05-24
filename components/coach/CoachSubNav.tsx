"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const links = [
  { href: "/coach", label: "Visão geral", exact: true },
  { href: "/coach/hoje", label: "Hoje" },
  { href: "/coach/materias", label: "Matérias" },
  { href: "/coach/editais", label: "Prova / Edital" },
  { href: "/coach/inbox", label: "Ações pendentes" },
]

export default function CoachSubNav() {
  const pathname = usePathname()

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {links.map(({ href, label, exact }) => {
        const active = exact
          ? pathname === href
          : pathname.startsWith(href) && href !== "/coach"
        const isHub = href === "/coach" && pathname === "/coach"
        const on = exact ? isHub : active
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              on
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
