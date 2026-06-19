"use client"

import { useParams } from "next/navigation"
import MateriaQuestoesContent from "@/components/materias/MateriaQuestoesContent"

export default function MateriaQuestoesPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  return <MateriaQuestoesContent subjectId={subjectId} embedded />
}
