"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const links = [
  { href: "/questoes", label: "Início", exact: true },
  { href: "/questoes/estatisticas", label: "Estatísticas" },
]

export default function QuestoesSubNav() {
  const pathname = usePathname()
  const show =
    pathname === "/questoes" || pathname.startsWith("/questoes/estatisticas")

  if (!show) return null

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {links.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active
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
