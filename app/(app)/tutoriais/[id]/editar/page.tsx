"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import TutorialForm from "@/components/tutorials/TutorialForm"
import { tutorialsFetch } from "@/lib/tutorials-client"
import type { Tutorial } from "@/lib/tutorials"

export default function EditarTutorialPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [tutorial, setTutorial] = useState<Tutorial | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) {
          router.push("/login")
          return
        }
        const manageRes = await tutorialsFetch("/api/tutorials/can-manage")
        const manageData = await manageRes.json().catch(() => ({}))
        if (cancelled) return
        if (!manageData.canManage) {
          router.replace("/tutoriais")
          return
        }
        const res = await tutorialsFetch(`/api/tutorials/${params.id}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setError(data.error ?? "Tutorial não encontrado")
          return
        }
        setTutorial(data.tutorial as Tutorial)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Tutorial não encontrado")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params.id, router])

  if (error) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-slate-500" asChild>
          <Link href="/tutoriais">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      </main>
    )
  }

  if (!tutorial) {
    return <p className="p-8 text-slate-500">Carregando…</p>
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 pb-12 sm:p-6">
      <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-slate-500" asChild>
        <Link href={`/tutoriais/${tutorial.id}`}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </Button>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Editar tutorial</h1>
        <p className="mt-1 text-sm text-slate-500">
          Atualize as informações. Envie um novo vídeo apenas se quiser substituir o atual.
        </p>
      </header>
      <TutorialForm mode="edit" initial={tutorial} />
    </main>
  )
}
