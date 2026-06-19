"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

export default function LegacySubjectRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const subjectId = params.id as string

  useEffect(() => {
    router.replace(`/materias/${subjectId}/erros`)
  }, [router, subjectId])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-slate-600">Redirecionando para o hub de matérias…</p>
    </main>
  )
}
