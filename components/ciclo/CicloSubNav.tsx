"use client"

import { usePathname } from "next/navigation"
import ScrollableSubNav from "@/components/ScrollableSubNav"

const links = [
  { href: "/ciclo", label: "Visão geral", exact: true },
  { href: "/ciclo/conteudo", label: "Conteúdo" },
  { href: "/ciclo/planejar", label: "Planejar" },
  { href: "/ciclo/semana", label: "Semana" },
  { href: "/ciclo/configuracoes", label: "Configurações" },
]

export default function CicloSubNav() {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return <ScrollableSubNav links={links} isActive={isActive} />
}
