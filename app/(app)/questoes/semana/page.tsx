"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Play, Upload } from "lucide-react"

type Notebook = {
  id: string
  name: string
  subject_id: string
  question_count: number
  answered_count: number
}

type StudySession = {
  id: string
  name: string
  status: string
  shuffle: boolean
  queue: unknown[]
  answered_tec_ids: number[]
  study_elapsed_ms?: number
  updated_at: string
  created_at: string
}

export default function SemanaPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sessionName, setSessionName] = useState("Estudo da semana")
  const [shuffle, setShuffle] = useState(true)
  const [files, setFiles] = useState<FileList | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)

  function reload(uid: string) {
    fetch(`/api/notebooks?user_id=${uid}`).then((r) => r.json()).then(setNotebooks)
    fetch(`/api/study-sessions?user_id=${uid}`)
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
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
  }, [router])

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function batchImport() {
    if (!userId || !files?.length) return
    setBatchLoading(true)
    const fd = new FormData()
    fd.append("user_id", userId)
    for (let i = 0; i < files.length; i++) {
      fd.append("files", files[i])
    }
    await fetch("/api/questions/import/batch", { method: "POST", body: fd })
    reload(userId)
    setBatchLoading(false)
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

  const openSessions = sessions.filter((s) => s.status === "in_progress")

  function formatElapsed(ms?: number) {
    if (!ms) return "00:00:00"
    const total = Math.floor(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":")
  }

  return (
    <div className="p-6">
      <Link href="/questoes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold">Semana — import em lote e estudo combinado</h1>

      {openSessions.length > 0 && (
        <section className="mt-8 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <h2 className="font-semibold text-blue-900">Estudos combinados em andamento</h2>
          <p className="mt-1 text-sm text-slate-600">
            Salvos na sua conta — pode sair e voltar quando quiser.
          </p>
          <ul className="mt-4 space-y-2">
            {openSessions.map((s) => {
              const total = Array.isArray(s.queue) ? s.queue.length : 0
              const done = (s.answered_tec_ids ?? []).length
              return (
                <li key={s.id}>
                  <Link
                    href={`/questoes/estudo/${s.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-3 text-sm hover:border-blue-300"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-slate-500">
                      {done}/{total} questões · {formatElapsed(s.study_elapsed_ms)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Importar vários PDFs</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sem escolher matéria — os cadernos vão para{" "}
          <Link href="/questoes/importados" className="text-blue-600 underline">
            Importados
          </Link>
          .
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            type="file"
            accept=".pdf"
            multiple
            onChange={(e) => setFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={batchImport}
            disabled={batchLoading || !files?.length}
            className="inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {batchLoading ? "Importando..." : "Importar todos"}
          </button>
        </div>
      </section>

      <section className="mt-8 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Novo estudo combinado</h2>
        <input
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          className="mt-3 w-full max-w-md rounded border px-3 py-2 text-sm"
        />
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shuffle}
            onChange={(e) => setShuffle(e.target.checked)}
          />
          Ordem aleatória
        </label>
        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {notebooks.map((nb) => (
            <li key={nb.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(nb.id)}
                  onChange={() => toggle(nb.id)}
                />
                <span className="font-medium">{nb.name}</span>
                <span className="text-slate-500">
                  ({nb.answered_count}/{nb.question_count})
                </span>
              </label>
            </li>
          ))}
        </ul>
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
