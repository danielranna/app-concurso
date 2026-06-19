"use client"

import { useParams } from "next/navigation"
import SubjectErrorsView from "@/components/materias/SubjectErrorsView"

export default function MateriaErrosPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  return <SubjectErrorsView subjectId={subjectId} embedded />
}
