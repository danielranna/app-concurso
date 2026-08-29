"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import TutorialForm from "@/components/tutorials/TutorialForm"
import { tutorialsFetch } from "@/lib/tutorials-client"

export default function NovoTutorialPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)

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
        const res = await tutorialsFetch("/api/tutorials/can-manage")
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!data.canManage) {
          router.replace("/tutoriais")
          return
        }
        setAllowed(true)
      } catch {
        if (!cancelled) router.replace("/tutoriais")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  if (!allowed) {
    return <p className="p-8 text-slate-500">Carregando…</p>
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 pb-12 sm:p-6">
      <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-slate-500" asChild>
        <Link href="/tutoriais">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </Button>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Novo tutorial</h1>
        <p className="mt-1 text-sm text-slate-500">
          Preencha as informações e envie o vídeo para publicar na biblioteca.
        </p>
      </header>
      <TutorialForm mode="create" />
    </main>
  )
}
