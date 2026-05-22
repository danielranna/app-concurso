"use client"

import { useEffect, useState, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Upload } from "lucide-react"

type Subject = { id: string; name: string }

function ImportarContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const presetSubject = searchParams.get("subject_id")
  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState(presetSubject ?? "")
  const [name, setName] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      if (presetSubject) {
        fetch(`/api/subjects?user_id=${user.id}`)
          .then((r) => r.json())
          .then(setSubjects)
      }
    })
  }, [router, presetSubject])

  async function handlePreview() {
    if (!file) return
    setLoading(true)
    setError(null)
    setPreview(null)
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/questions/import/preview", { method: "POST", body: fd })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Falha na pré-visualização")
      setLoading(false)
      return
    }
    setPreview(data)
    if (data.name && !name) setName(data.name as string)
    setLoading(false)
  }

  async function handleImport() {
    if (!file || !userId) return
    setLoading(true)
    setError(null)
    setResult(null)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("user_id", userId)
    if (subjectId) fd.append("subject_id", subjectId)
    if (name) fd.append("name", name)
    const res = await fetch("/api/questions/import/pdf", { method: "POST", body: fd })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Falha ao importar")
      setLoading(false)
      return
    }
    if (!data.notebook_id) {
      setError("Importação incompleta: caderno não foi criado")
      setLoading(false)
      return
    }
    setResult(data)
    setLoading(false)
  }

  return (
    <div className="max-w-2xl p-6">
      <Link href="/questoes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold">Importar PDF do TEC</h1>
      <p className="mt-2 text-sm text-slate-600">
        O PDF já traz matéria e assunto do TEC. Basta importar; depois você vincula às suas
        matérias em{" "}
        <Link href="/questoes/mapeamento" className="text-blue-600 underline">
          Associar matérias
        </Link>
        .
      </p>
      <div className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium">Arquivo PDF</label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setPreview(null)
              setResult(null)
              setError(null)
            }}
            className="mt-1 block w-full text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Nome do caderno</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            placeholder="Opcional — usa nome do PDF"
          />
        </div>
        {presetSubject && subjects.length > 0 && (
          <div>
            <label className="text-sm font-medium text-slate-500">
              Organizar já nesta matéria (opcional)
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            >
              <option value="">Deixar em Importados</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={!file || loading}
            className="rounded border px-4 py-2 text-sm"
          >
            Pré-visualizar
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!file || loading}
            className="inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> Importar
          </button>
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
        {preview && !error && (
          <div className="rounded-lg border bg-slate-50 p-4 text-sm">
            <p>Questões detectadas: {String(preview.question_count ?? 0)}</p>
            {(preview.warnings as string[])?.map((w, i) => (
              <p key={i} className="text-amber-700">
                {w}
              </p>
            ))}
            <ul className="mt-2 list-disc pl-4">
              {(preview.preview as { tec_id: number; tec_subject: string; tec_topic?: string }[])?.map(
                (q) => (
                  <li key={q.tec_id}>
                    #{q.tec_id} — {q.tec_subject}
                    {q.tec_topic ? ` · ${q.tec_topic}` : ""}
                  </li>
                )
              )}
            </ul>
          </div>
        )}
        {typeof result?.notebook_id === "string" && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
            <p>Caderno criado!</p>
            <p>Novas questões: {String(result.created_questions ?? 0)}</p>
            <p>Reutilizadas: {String(result.reused_questions ?? 0)}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link
                href={`/questoes/cadernos/${result.notebook_id as string}`}
                className="text-blue-600 underline"
              >
                Abrir caderno
              </Link>
              <Link href="/questoes/importados" className="text-blue-600 underline">
                Ver em Importados
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ImportarPage() {
  return (
    <Suspense fallback={<p className="p-6">Carregando...</p>}>
      <ImportarContent />
    </Suspense>
  )
}
