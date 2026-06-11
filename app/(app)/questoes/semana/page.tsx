"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Play, Trash2, Upload } from "lucide-react"
import { formatElapsed } from "@/lib/format-elapsed"

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
    <div className="p-6">
      <Link href="/questoes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold">Semana — import em lote e estudo combinado</h1>

      {openSessions.length > 0 && (
        <section className="mt-8 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <h2 className="font-semibold text-blue-900">Estudos combinados em andamento</h2>
          <ul className="mt-4 space-y-2">
            {openSessions.map((s) => {
              const total = Array.isArray(s.queue) ? s.queue.length : 0
              const done = s.resolved_count ?? (s.answered_tec_ids ?? []).length
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-3"
                >
                  <Link
                    href={`/questoes/estudo/${s.id}`}
                    className="min-w-0 flex-1 text-sm font-medium text-blue-800 hover:underline"
                  >
                    {s.name}
                    <span className="ml-2 font-normal text-slate-500">
                      {done}/{total} · {formatElapsed(s.study_elapsed_ms ?? 0)}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => deleteSession(s.id, s.name)}
                    className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Importar vários PDFs</h2>
        <p className="mt-1 text-sm text-slate-600">
          Use a fila com barra de progresso — um PDF por vez, mesmo parser do wizard.
        </p>
        <Link
          href="/questoes/importar?mode=bulk"
          className="mt-3 inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm text-white"
        >
          <Upload className="h-4 w-4" />
          Abrir importação em lote
        </Link>
      </section>

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Novo estudo combinado</h2>
        <input
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          placeholder="Nome do estudo"
          className="mt-3 w-full max-w-md rounded border px-3 py-2 text-sm"
        />
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
          Ordem aleatória
        </label>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar caderno..."
            className="min-w-[12rem] flex-1 rounded border px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Incluir cadernos concluídos
          </label>
        </div>

        <p className="mt-3 text-sm text-slate-600">
          {selected.size} caderno(s) · ~{pendingQuestions} questões pendentes no total
        </p>

        <div className="mt-4 max-h-80 space-y-4 overflow-y-auto">
          {grouped.length === 0 && (
            <p className="text-sm text-slate-500">
              {showCompleted
                ? "Nenhum caderno encontrado."
                : "Nenhum caderno com questões pendentes. Marque “Incluir concluídos” ou importe PDFs."}
            </p>
          )}
          {grouped.map(([subjectKey, list]) => (
            <div key={subjectKey}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {subjectName(subjectKey === "__none__" ? null : subjectKey)}
              </p>
              <ul className="space-y-1">
                {list.map((nb) => {
                  const pending = Math.max(0, nb.question_count - nb.answered_count)
                  return (
                    <li key={nb.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selected.has(nb.id)}
                          onChange={() => toggle(nb.id)}
                        />
                        <span className="min-w-0 flex-1 font-medium">{nb.name}</span>
                        <span className="shrink-0 text-slate-500">
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

        <button
          type="button"
          onClick={startCombined}
          disabled={selected.size === 0}
          className="mt-4 inline-flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> Iniciar estudo ({selected.size} cadernos)
        </button>
      </section>
    </div>
  )
}
