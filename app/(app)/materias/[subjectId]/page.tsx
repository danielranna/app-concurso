"use client"

import { useParams } from "next/navigation"
import MateriaOverviewPage from "@/components/materias/MateriaOverviewPage"

export default function MateriaVisaoGeralPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  return <MateriaOverviewPage subjectId={subjectId} />
}
