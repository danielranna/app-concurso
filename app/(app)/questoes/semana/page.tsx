"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Play, Trash2, Upload } from "lucide-react"
import { formatElapsed } from "@/lib/format-elapsed"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  QuestoesPageHeader,
  QuestoesSection,
} from "@/components/questions/questoes-shell"
import { cn } from "@/lib/utils"

type Notebook = {
  id: string
  name: string
  subject_id: string | null
  question_count: number
  answered_count: number
}

type Subject = { id: string; name: string }

type StudySession = {
  id: string
  name: string
  status: string
  shuffle: boolean
  queue: unknown[]
  answered_tec_ids: number[]
  resolved_count?: number
  study_elapsed_ms?: number
  updated_at: string
}

export default function SemanaPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sessionName, setSessionName] = useState("Estudo da semana")
  const [shuffle, setShuffle] = useState(true)
  const [search, setSearch] = useState("")
  const [showCompleted, setShowCompleted] = useState(false)

  function reload(uid: string) {
    const nbUrl = showCompleted
      ? `/api/notebooks?user_id=${uid}`
      : `/api/notebooks?user_id=${uid}&incomplete=1`
    fetch(nbUrl).then((r) => r.json()).then(setNotebooks)
    fetch(`/api/study-sessions?user_id=${uid}`)
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
    fetch(`/api/subjects?user_id=${uid}`)
      .then((r) => r.json())
      .then((data) => setSubjects(Array.isArray(data) ? data : []))
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reload(user.id)
    })
  }, [router, showCompleted])

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function startCombined() {
    if (!userId || selected.size === 0) return
    const res = await fetch("/api/study-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: sessionName,
        notebook_ids: [...selected],
        shuffle,
      }),
    })
    const data = await res.json()
    if (data.session?.id) {
      reload(userId)
      router.push(`/questoes/estudo/${data.session.id}`)
    }
  }

  async function deleteSession(id: string, name: string) {
    if (!userId || !confirm(`Excluir o estudo "${name}"?`)) return
    await fetch(`/api/study-sessions/${id}?user_id=${userId}`, { method: "DELETE" })
    reload(userId)
  }

  const subjectName = useMemo(() => {
    const m = new Map(subjects.map((s) => [s.id, s.name]))
    return (id: string | null) => (id ? m.get(id) ?? "Matéria" : "Sem matéria")
  }, [subjects])

  const filteredNotebooks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return notebooks
    return notebooks.filter((nb) => nb.name.toLowerCase().includes(q))
  }, [notebooks, search])

  const grouped = useMemo(() => {
    const map = new Map<string, Notebook[]>()
    for (const nb of filteredNotebooks) {
      const key = nb.subject_id ?? "__none__"
      const list = map.get(key) ?? []
      list.push(nb)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) =>
      subjectName(a[0] === "__none__" ? null : a[0]).localeCompare(
        subjectName(b[0] === "__none__" ? null : b[0]),
        "pt-BR"
      )
    )
  }, [filteredNotebooks, subjectName])

  const pendingQuestions = useMemo(() => {
    let total = 0
    for (const id of selected) {
      const nb = notebooks.find((n) => n.id === id)
      if (nb) total += Math.max(0, nb.question_count - nb.answered_count)
    }
    return total
  }, [selected, notebooks])

  const openSessions = sessions.filter((s) => s.status === "in_progress")

  return (
    <div className="space-y-6">
      <QuestoesPageHeader
        title="Semana"
        description="Importação em lote e estudos combinados com vários cadernos."
      />

      {openSessions.length > 0 && (
        <QuestoesSection title="Estudos em andamento">
          <ul className="space-y-2">
            {openSessions.map((s) => {
              const total = Array.isArray(s.queue) ? s.queue.length : 0
              const done = s.resolved_count ?? (s.answered_tec_ids ?? []).length
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <li key={s.id}>
                  <Card className="border-teal-200/60 bg-teal-50/30">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Link
                          href={`/questoes/estudo/${s.id}`}
                          className="block text-sm font-medium text-teal-900 hover:underline"
                        >
                          {s.name}
                        </Link>
                        <div className="flex items-center gap-3">
                          <Progress value={pct} className="h-1.5 max-w-xs flex-1" />
                          <span className="shrink-0 text-xs tabular-nums text-slate-500">
                            {done}/{total} · {formatElapsed(s.study_elapsed_ms ?? 0)}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        onClick={() => deleteSession(s.id, s.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        </QuestoesSection>
      )}

      <QuestoesSection
        title="Importar vários PDFs"
        description="Fila com barra de progresso — um PDF por vez, mesmo parser do wizard."
        action={
          <Button asChild>
            <Link href="/questoes/importar?mode=bulk">
              <Upload className="h-4 w-4" />
              Abrir importação em lote
            </Link>
          </Button>
        }
      >
        <p className="text-sm text-slate-500">
          Ideal para importar provas da semana de uma só vez.
        </p>
      </QuestoesSection>

      <QuestoesSection title="Novo estudo combinado">
        <div className="space-y-4">
          <Input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="Nome do estudo"
            className="max-w-md"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30"
            />
            Ordem aleatória
          </label>

          <div className="flex flex-wrap gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar caderno..."
              className="min-w-[12rem] max-w-sm flex-1"
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30"
              />
              Incluir cadernos concluídos
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{selected.size} caderno(s)</Badge>
            <Badge variant="outline">~{pendingQuestions} pendentes</Badge>
          </div>

          <div className="max-h-80 space-y-4 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
            {grouped.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">
                {showCompleted
                  ? "Nenhum caderno encontrado."
                  : "Nenhum caderno com questões pendentes. Marque “Incluir concluídos” ou importe PDFs."}
              </p>
            )}
            {grouped.map(([subjectKey, list]) => (
              <div key={subjectKey}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {subjectName(subjectKey === "__none__" ? null : subjectKey)}
                </p>
                <ul className="space-y-1">
                  {list.map((nb) => {
                    const pending = Math.max(0, nb.question_count - nb.answered_count)
                    const checked = selected.has(nb.id)
                    return (
                      <li key={nb.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition",
                            checked
                              ? "border-teal-300 bg-teal-50/60"
                              : "border-transparent bg-white hover:border-slate-200"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(nb.id)}
                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30"
                          />
                          <span className="min-w-0 flex-1 font-medium text-slate-800">
                            {nb.name}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-slate-500">
                            {nb.answered_count}/{nb.question_count}
                            {pending > 0 && (
                              <span className="ml-1 text-amber-700">({pending} pendentes)</span>
                            )}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>

          <Button onClick={startCombined} disabled={selected.size === 0}>
            <Play className="h-4 w-4" />
            Iniciar estudo ({selected.size} cadernos)
          </Button>
        </div>
      </QuestoesSection>
    </div>
  )
}
