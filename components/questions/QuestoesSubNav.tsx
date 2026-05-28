"use client"

import { usePathname } from "next/navigation"
import ScrollableSubNav from "@/components/ScrollableSubNav"

const links = [
  { href: "/questoes", label: "Início", exact: true },
  { href: "/questoes/estatisticas", label: "Estatísticas" },
]

export default function QuestoesSubNav() {
  const pathname = usePathname()
  const show =
    pathname === "/questoes" || pathname.startsWith("/questoes/estatisticas")

  if (!show) return null

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  return <ScrollableSubNav links={links} isActive={isActive} />
}
