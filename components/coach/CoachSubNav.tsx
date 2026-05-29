"use client"

import { usePathname } from "next/navigation"
import ScrollableSubNav from "@/components/ScrollableSubNav"

const links = [
  { href: "/coach", label: "Visão geral", exact: true },
  { href: "/coach/hoje", label: "Hoje" },
  { href: "/coach/executor", label: "Executor" },
  { href: "/coach/materias", label: "Matérias" },
  { href: "/coach/editais", label: "Prova / Edital" },
  { href: "/coach/inbox", label: "Pendências" },
  { href: "/coach/configuracoes", label: "Configurações" },
]

export default function CoachSubNav() {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    if (href === "/coach") return pathname === "/coach"
    return pathname.startsWith(href)
  }

  return <ScrollableSubNav links={links} isActive={isActive} />
}
