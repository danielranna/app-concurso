"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import TutorialCard from "@/components/tutorials/TutorialCard"
import TutorialGridSkeleton from "@/components/tutorials/TutorialGridSkeleton"
import { tutorialsFetch } from "@/lib/tutorials-client"
import type { Tutorial } from "@/lib/tutorials"

export default function TutoriaisPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [tutorials, setTutorials] = useState<Tutorial[]>([])
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("publicado") === "1") {
      setSuccess("Tutorial publicado.")
    } else if (params.get("atualizado") === "1") {
      setSuccess("Tutorial atualizado.")
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const qs = search ? `?q=${encodeURIComponent(search)}` : ""
    const [listRes, manageRes] = await Promise.all([
      tutorialsFetch(`/api/tutorials${qs}`),
      tutorialsFetch("/api/tutorials/can-manage"),
    ])
    const listData = await listRes.json().catch(() => ({}))
    const manageData = await manageRes.json().catch(() => ({}))

    if (!listRes.ok) {
      setError(listData.error ?? "Não foi possível carregar os tutoriais")
      setTutorials([])
    } else {
      setTutorials((listData.tutorials ?? []) as Tutorial[])
    }
    setCanManage(Boolean(manageData.canManage))
    setLoading(false)
  }, [search])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      load()
    })
  }, [router, load])

  async function handleDelete(tutorial: Tutorial) {
    if (!confirm(`Excluir o tutorial "${tutorial.title}"? Esta ação não pode ser desfeita.`)) {
      return
    }
    setError(null)
    setSuccess(null)
    const res = await tutorialsFetch(`/api/tutorials/${tutorial.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? "Não foi possível excluir o tutorial")
      return
    }
    setSuccess("Tutorial excluído.")
    setTutorials((prev) => prev.filter((t) => t.id !== tutorial.id))
  }

  const canReorder = canManage && !search && tutorials.length > 1

  async function persistOrder(next: Tutorial[]) {
    setSavingOrder(true)
    setError(null)
    const res = await tutorialsFetch("/api/tutorials/reorder", {
      method: "POST",
      body: JSON.stringify({ ids: next.map((t) => t.id) }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingOrder(false)
    if (!res.ok) {
      setError(data.error ?? "Não foi possível salvar a ordem")
      load()
      return
    }
    setSuccess("Ordem da listagem atualizada.")
  }

  function moveTutorial(id: string, delta: number) {
    const index = tutorials.findIndex((t) => t.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= tutorials.length) return
    const next = [...tutorials]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    setTutorials(next)
    void persistOrder(next)
  }

  function dropOn(target: Tutorial) {
    if (!dragId || dragId === target.id) {
      setDragId(null)
      setDropId(null)
      return
    }
    const from = tutorials.findIndex((t) => t.id === dragId)
    const to = tutorials.findIndex((t) => t.id === target.id)
    setDragId(null)
    setDropId(null)
    if (from < 0 || to < 0) return
    const next = [...tutorials]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setTutorials(next)
    void persistOrder(next)
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pb-12 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tutoriais</h1>
          <p className="mt-1 text-sm text-slate-500">
            Biblioteca de vídeos para aprender a usar o sistema.
          </p>
        </div>
        {canManage && (
          <Button asChild>
            <Link href="/tutoriais/novo">
              <Plus className="h-4 w-4" />
              Novo tutorial
            </Link>
          </Button>
        )}
      </header>

      <div className="flex max-w-md flex-col gap-2 sm:max-w-none sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título ou descrição"
            className="pl-9"
            aria-label="Buscar tutoriais"
          />
        </div>
        {canReorder && (
          <p className="text-xs text-slate-500">
            Arraste pelo ícone ou use as setas para definir a ordem.
            {savingOrder ? " Salvando…" : ""}
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}

      {loading ? (
        <TutorialGridSkeleton />
      ) : tutorials.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="font-medium text-slate-700">
              {search ? "Nenhum tutorial encontrado" : "Nenhum tutorial publicado ainda"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {search
                ? "Tente outro termo de busca."
                : canManage
                  ? "Clique em Novo tutorial para publicar o primeiro vídeo."
                  : "Quando um tutorial for publicado, ele aparece aqui."}
            </p>
            {canManage && !search && (
              <Button asChild className="mt-4">
                <Link href="/tutoriais/novo">
                  <Plus className="h-4 w-4" />
                  Novo tutorial
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tutorials.map((tutorial, index) => (
            <TutorialCard
              key={tutorial.id}
              tutorial={tutorial}
              canManage={canManage}
              canReorder={canReorder && !savingOrder}
              isFirst={index === 0}
              isLast={index === tutorials.length - 1}
              isDragging={dragId === tutorial.id}
              isDropTarget={dropId === tutorial.id && dragId !== tutorial.id}
              onDelete={handleDelete}
              onMoveUp={() => moveTutorial(tutorial.id, -1)}
              onMoveDown={() => moveTutorial(tutorial.id, 1)}
              onDragStart={(item) => setDragId(item.id)}
              onDragOver={(item) => setDropId(item.id)}
              onDrop={dropOn}
              onDragEnd={() => {
                setDragId(null)
                setDropId(null)
              }}
            />
          ))}
        </div>
      )}
    </main>
  )
}
