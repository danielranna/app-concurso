"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  getCoachUploadMaxBytes,
  getCoachUploadMaxLabel,
  uploadCoachStudyMaterials,
  usesExternalCoachUpload,
} from "@/lib/coach-upload-client"
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  BookOpen,
  Send,
  XCircle,
} from "lucide-react"

type UploadQueueItem = {
  id: string
  file: File
  status: "pending" | "uploading" | "done" | "error"
  error?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const uploadProcessingRef = useRef(false)
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

  const uploadMaxLabel = getCoachUploadMaxLabel()
  const uploadMaxBytes = getCoachUploadMaxBytes()
  const externalUpload = usesExternalCoachUpload()

  const readQueue = useCallback(
    () =>
      new Promise<UploadQueueItem[]>((resolve) => {
        setUploadQueue((prev) => {
          resolve(prev)
          return prev
        })
      }),
    []
  )

  const patchQueueItem = useCallback((id: string, patch: Partial<UploadQueueItem>) => {
    setUploadQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }, [])

  const drainUploadQueue = useCallback(async () => {
    if (!userId || uploadProcessingRef.current) return
    uploadProcessingRef.current = true
    let uploadedSinceJobs = 0

    try {
      while (true) {
        const snapshot = await readQueue()
        const next = snapshot.find((i) => i.status === "pending")
        if (!next) break

        patchQueueItem(next.id, { status: "uploading" })

        const { okCount, errors } = await uploadCoachStudyMaterials({
          files: [next.file],
          userId,
          subjectId,
        })

        if (okCount > 0) {
          uploadedSinceJobs++
          patchQueueItem(next.id, { status: "done" })
          await loadDocs(userId)
          if (uploadedSinceJobs % 3 === 0) {
            await fetch("/api/coach/jobs/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: userId, limit: 3 }),
            }).catch(() => {})
          }
        } else {
          patchQueueItem(next.id, {
            status: "error",
            error: errors[0] ?? "Falha no envio",
          })
        }
      }

      if (uploadedSinceJobs > 0) {
        await fetch("/api/coach/jobs/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, limit: 8 }),
        }).catch(() => {})
        await loadDocs(userId)
      }
    } finally {
      uploadProcessingRef.current = false
      const remaining = await readQueue()
      if (remaining.some((i) => i.status === "pending")) {
        void drainUploadQueue()
      }
    }
  }, [userId, subjectId, loadDocs, readQueue, patchQueueItem])

  function onFilesPicked(files: FileList | null) {
    if (!files?.length) return

    const newItems: UploadQueueItem[] = Array.from(files).map((file) => {
      if (file.size > uploadMaxBytes) {
        return {
          id: crypto.randomUUID(),
          file,
          status: "error" as const,
          error: `Maior que ${uploadMaxLabel}`,
        }
      }
      return {
        id: crypto.randomUUID(),
        file,
        status: "pending" as const,
      }
    })

    setUploadQueue((prev) => [...prev, ...newItems])
    if (fileRef.current) fileRef.current.value = ""
    void drainUploadQueue()
  }

  function removeQueueItem(id: string) {
    setUploadQueue((prev) => {
      const item = prev.find((i) => i.id === id)
      if (item?.status === "uploading") return prev
      return prev.filter((i) => i.id !== id)
    })
  }

  const queuePendingCount = uploadQueue.filter((i) => i.status === "pending").length
  const queueActiveCount = uploadQueue.filter(
    (i) => i.status === "pending" || i.status === "uploading"
  ).length

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
        <div className="flex flex-wrap items-start gap-3">
          <BookOpen className="h-8 w-8 shrink-0 text-violet-700" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900">Enviar PDFs de estudo</h3>
            <p className="text-sm text-slate-600">
              Escolha os PDFs: cada um entra na fila abaixo (enviando → pronto). Pode adicionar
              mais a qualquer momento
              {externalUpload
                ? ` (até ${uploadMaxLabel} cada, pela VPS).`
                : ` (máx. ${uploadMaxLabel} por arquivo na Vercel).`}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => onFilesPicked(e.target.files)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-medium text-violet-800 hover:bg-violet-50"
            >
              <Upload className="h-4 w-4" />
              Escolher PDFs
            </button>
            <button
              type="button"
              onClick={() => void drainUploadQueue()}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
            >
              {queueActiveCount > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar
              {queuePendingCount > 0 ? ` (${queuePendingCount})` : ""}
            </button>
          </div>
        </div>

        {uploadQueue.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-violet-200/80 pt-4">
            {uploadQueue.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-violet-100 bg-white px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatFileSize(item.file.size)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.status === "pending" && (
                    <span className="text-xs font-medium text-slate-500">Na fila</span>
                  )}
                  {item.status === "uploading" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Enviando…
                    </span>
                  )}
                  {item.status === "done" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Pronto
                    </span>
                  )}
                  {item.status === "error" && (
                    <span
                      className="inline-flex max-w-[10rem] items-center gap-1.5 text-xs font-medium text-red-700"
                      title={item.error}
                    >
                      <XCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{item.error ?? "Erro"}</span>
                    </span>
                  )}
                  {item.status !== "uploading" && (
                    <button
                      type="button"
                      onClick={() => removeQueueItem(item.id)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title="Remover da fila"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
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
