"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  BookOpen,
  Send,
} from "lucide-react"

type MaterialDoc = {
  id: string
  title: string
  status: string
  ingest_stage?: string
  ingest_error?: string | null
  chunk_count?: number
  page_count?: number
  char_count?: number
  created_at?: string
}

const STAGE_LABELS: Record<string, string> = {
  uploaded: "Enviado",
  parsing: "Extraindo texto",
  chunking: "Indexando",
  embedding: "Vetorizando",
  ready: "Pronto",
  failed: "Falhou",
}

export default function CoachMateriaisBibliotecaPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const subjectId = params.subjectId as string
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const chatSectionRef = useRef<HTMLElement>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [subjectName, setSubjectName] = useState("")
  const [docs, setDocs] = useState<MaterialDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState("")
  const [answer, setAnswer] = useState<{
    answer: string
    citations: { document_title: string; excerpt: string; page?: number | null }[]
    source: string
  } | null>(null)
  const [asking, setAsking] = useState(false)

  const loadDocs = useCallback(
    async (uid: string) => {
      const res = await fetch(
        `/api/coach/documents?user_id=${uid}&subject_id=${subjectId}&doc_type=study_material`
      )
      const data = await res.json()
      if (Array.isArray(data)) setDocs(data)
    },
    [subjectId]
  )

  useEffect(() => {
    const ask = searchParams.get("ask")
    if (ask) {
      setQuery(ask)
      setTimeout(() => chatSectionRef.current?.scrollIntoView({ behavior: "smooth" }), 400)
    }
  }, [searchParams])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/subjects?user_id=${user.id}`)
        .then((r) => r.json())
        .then((subs: { id: string; name: string }[]) => {
          const sub = subs.find((s) => s.id === subjectId)
          setSubjectName(sub?.name ?? "Matéria")
        })
      loadDocs(user.id).finally(() => setLoading(false))
    })
  }, [subjectId, router, loadDocs])

  useEffect(() => {
    if (!userId) return
    const pending = docs.some(
      (d) =>
        d.ingest_stage &&
        !["ready", "failed"].includes(d.ingest_stage) &&
        d.status !== "ready"
    )
    if (!pending) return
    const t = setInterval(() => loadDocs(userId), 4000)
    return () => clearInterval(t)
  }, [userId, docs, loadDocs])

  async function onUpload(files: FileList | null) {
    if (!userId || !files?.length) return
    setUploading(true)
    const form = new FormData()
    form.append("user_id", userId)
    form.append("subject_id", subjectId)
    form.append("doc_type", "study_material")
    for (let i = 0; i < files.length; i++) {
      form.append("files", files[i]!)
    }
    try {
      const res = await fetch("/api/coach/documents/upload", {
        method: "POST",
        body: form,
      })
      const data = await res.json()
      if (!res.ok) alert(data.error ?? "Erro no upload")
      else {
        await fetch("/api/coach/jobs/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, limit: 3 }),
        }).catch(() => {})
        await loadDocs(userId)
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function reprocess(docId: string) {
    if (!userId) return
    await fetch(`/api/coach/documents/${docId}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
    await fetch("/api/coach/jobs/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, limit: 2 }),
    }).catch(() => {})
    await loadDocs(userId)
  }

  async function removeDoc(docId: string) {
    if (!userId || !confirm("Excluir este PDF e todos os trechos indexados?")) return
    await fetch(`/api/coach/documents/${docId}?user_id=${userId}`, {
      method: "DELETE",
    })
    await loadDocs(userId)
  }

  async function askProfessor() {
    if (!userId || !query.trim()) return
    setAsking(true)
    setAnswer(null)
    try {
      const res = await fetch("/api/coach/teacher/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          subject_id: subjectId,
          query: query.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) alert(data.error ?? "Erro")
      else setAnswer(data.answer)
    } finally {
      setAsking(false)
    }
  }

  const readyCount = docs.filter(
    (d) => d.ingest_stage === "ready" || d.status === "ready"
  ).length

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando biblioteca…
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Link
        href="/coach/materias"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Matérias
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{subjectName}</h2>
          <p className="text-sm text-slate-600">
            Biblioteca de PDFs para o Professor ({readyCount}/{docs.length} prontos)
          </p>
        </div>
        <Link
          href={`/coach/materias/${subjectId}/insights`}
          className="text-sm font-medium text-violet-700 underline"
        >
          Insights e fila estratégica
        </Link>
      </div>

      <section className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <BookOpen className="h-8 w-8 text-violet-700" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900">Enviar PDFs de estudo</h3>
            <p className="text-sm text-slate-600">
              Selecione vários arquivos (até 20 MB cada). A indexação roda em segundo plano.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Escolher PDFs
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Arquivos
          </h3>
        </div>
        {!docs.length ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Nenhum PDF ainda. Envie apostilas, slides ou resumos da matéria.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{d.title}</p>
                  <p className="text-xs text-slate-500">
                    {STAGE_LABELS[d.ingest_stage ?? d.status] ??
                      d.status}{" "}
                    {d.chunk_count != null ? `· ${d.chunk_count} trechos` : ""}
                    {d.page_count ? ` · ${d.page_count} pág.` : ""}
                  </p>
                  {d.ingest_error && (
                    <p className="mt-1 text-xs text-red-600">{d.ingest_error}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => reprocess(d.id)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                    title="Reindexar"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDoc(d.id)}
                    className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        ref={chatSectionRef}
        className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4"
      >
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-800">
          Pergunte ao professor
        </h3>
        <p className="mb-3 text-sm text-slate-600">
          Respostas usam seus PDFs indexados (busca lexical + vetorial quando disponível).
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex.: O que é controle externo?"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && askProfessor()}
          />
          <button
            type="button"
            disabled={asking || !query.trim()}
            onClick={askProfessor}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {asking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Perguntar
          </button>
        </div>
        {answer && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-4 text-sm">
            <p className="mb-2 text-xs font-medium uppercase text-emerald-800">
              {answer.source === "material" ? "Com base nos seus PDFs" : "Resposta geral"}
            </p>
            <p className="whitespace-pre-wrap text-slate-800">{answer.answer}</p>
            {answer.citations?.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                {answer.citations.map((c, i) => (
                  <li key={i} className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">
                      {c.document_title}
                      {c.page != null ? ` (p. ${c.page})` : ""}
                    </span>
                    : {c.excerpt}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
