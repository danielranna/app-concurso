"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Pencil, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { formatTutorialDate, type Tutorial } from "@/lib/tutorials"
import { tutorialsFetch } from "@/lib/tutorials-client"

export default function TutorialWatchPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [tutorial, setTutorial] = useState<Tutorial | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
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

        const { data, error: queryError } = await supabase
          .from("tutorials")
          .select("*")
          .eq("id", params.id)
          .maybeSingle()

        if (cancelled) return
        if (queryError) {
          setError(queryError.message)
          return
        }
        if (!data || data.status !== "published") {
          setError("Tutorial não encontrado")
          return
        }

        setTutorial(data as Tutorial)
        tutorialsFetch("/api/tutorials/can-manage")
          .then((res) => res.json().catch(() => ({})))
          .then((manageData) => {
            if (!cancelled) setCanManage(Boolean(manageData.canManage))
          })
          .catch(() => {})
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Tutorial não encontrado")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params.id, router])

  async function handleDelete() {
    if (!tutorial) return
    if (!confirm(`Excluir o tutorial "${tutorial.title}"? Esta ação não pode ser desfeita.`)) {
      return
    }
    const res = await tutorialsFetch(`/api/tutorials/${tutorial.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? "Não foi possível excluir o tutorial")
      return
    }
    router.push("/tutoriais")
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <div className="h-8 w-40 animate-pulse rounded bg-slate-100" />
        <div className="aspect-video w-full animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-20 w-full animate-pulse rounded bg-slate-100" />
      </main>
    )
  }

  if (error || !tutorial) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-slate-500" asChild>
          <Link href="/tutoriais">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? "Tutorial não encontrado"}
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 pb-12 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-slate-500" asChild>
          <Link href="/tutoriais">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/tutoriais/${tutorial.id}/editar`}>
                <Pencil className="h-4 w-4" />
                Editar
              </Link>
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </div>
        )}
      </div>

      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{tutorial.title}</h1>

      <video
        src={tutorial.video_url}
        poster={tutorial.thumbnail_url ?? undefined}
        controls
        playsInline
        className="aspect-video w-full rounded-2xl bg-black shadow-sm"
      />

      <div className="space-y-2 text-sm text-slate-500">
        <p>
          Publicado em {formatTutorialDate(tutorial.created_at)}
          {tutorial.author_email ? ` · ${tutorial.author_email}` : ""}
        </p>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 sm:text-base">
        {tutorial.description}
      </p>
    </main>
  )
}
