"use client"

import { usePathname } from "next/navigation"
import ScrollableSubNav from "@/components/ScrollableSubNav"

type Props = {
  subjectId: string
}

export default function MateriaSubNav({ subjectId }: Props) {
  const pathname = usePathname()
  const base = `/materias/${subjectId}`

  const links = [
    { href: base, label: "Visão geral", exact: true },
    { href: `${base}/caderno`, label: "Caderno da matéria" },
    { href: `${base}/erros-ia`, label: "Caderno de erros" },
    { href: `${base}/flashcards`, label: "Flashcards" },
    { href: `${base}/erros`, label: "Erros" },
    { href: `${base}/questoes`, label: "Questões" },
  ]

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return <ScrollableSubNav links={links} isActive={isActive} />
}
