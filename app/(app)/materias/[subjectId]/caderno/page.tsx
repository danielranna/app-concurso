"use client"

import { useParams } from "next/navigation"
import MateriaUserNotebookPage from "@/components/materias/MateriaUserNotebookPage"

export default function MateriaCadernoPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  return <MateriaUserNotebookPage subjectId={subjectId} />
}
