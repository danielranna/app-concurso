"use client"

import { useParams } from "next/navigation"
import MateriaFlashcardsPanel from "@/components/materias/MateriaFlashcardsPanel"

export default function MateriaFlashcardsPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  return <MateriaFlashcardsPanel subjectId={subjectId} />
}
