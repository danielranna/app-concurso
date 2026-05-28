"use client"

import { useCallback, useEffect, useMemo, useState, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Upload } from "lucide-react"
import ImportQuestionReviewCard from "@/components/questions/ImportQuestionReviewCard"
import type { ParsedTecQuestion } from "@/lib/question-types"
import type { QuestionParseResult } from "@/lib/tec-pdf-parse-merge"
import type { NotebookParseResult } from "@/lib/tec-pdf-parse-pipeline"

type Subject = { id: string; name: string }
type WizardStep = 1 | 2 | 3

const PAGE_SIZE = 10
const LLM_ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_IMPORT_LLM_ENABLED !== "0"

function ImportarContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const presetSubject = searchParams.get("subject_id")

  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState(presetSubject ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<WizardStep>(1)
  const [parseResult, setParseResult] = useState<NotebookParseResult | null>(null)
  const [questions, setQuestions] = useState<QuestionParseResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commitResult, setCommitResult] = useState<Record<string, unknown> | null>(null)

  const [filterLow, setFilterLow] = useState(false)
  const [filterWarnings, setFilterWarnings] = useState(false)
  const [searchTecId, setSearchTecId] = useState("")
  const [page, setPage] = useState(0)

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

  const filteredQuestions = useMemo(() => {
    let list = questions
    if (filterLow) list = list.filter((q) => q.confidence === "low")
    if (filterWarnings) list = list.filter((q) => q.warnings.length > 0)
    if (searchTecId.trim()) {
      const id = parseInt(searchTecId, 10)
      if (!Number.isNaN(id)) list = list.filter((q) => q.tec_id === id)
    }
    return list
  }, [questions, filterLow, filterWarnings, searchTecId])

  const pageCount = Math.max(1, Math.ceil(filteredQuestions.length / PAGE_SIZE))
  const pageItems = filteredQuestions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const missingGabarito = useMemo(
    () => questions.filter((q) => !q.merged.correct_answer?.trim()),
    [questions]
  )

  const updateQuestion = useCallback((tecId: number, merged: ParsedTecQuestion) => {
    setQuestions((prev) =>
      prev.map((q) => (q.tec_id === tecId ? { ...q, merged } : q))
    )
  }, [])

  function resetWizard() {
    setStep(1)
    setParseResult(null)
    setQuestions([])
    setCommitResult(null)
    setError(null)
    setPage(0)
  }

  async function handleParse() {
    if (!file) return
    setLoading(true)
    setError(null)
    setParseResult(null)
    setQuestions([])
    setCommitResult(null)

    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/questions/import/parse", { method: "POST", body: fd })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Falha ao analisar PDF")
      setLoading(false)
      return
    }
    setParseResult(data as NotebookParseResult)
    setQuestions(data.questions as QuestionParseResult[])
    setLoading(false)
  }

  async function handleCommit() {
    if (!userId || !parseResult) return
    if (missingGabarito.length > 0) {
      setError(
        `${missingGabarito.length} questão(ões) sem gabarito. Volte à revisão e corrija.`
      )
      return
    }
    setLoading(true)
    setError(null)
    const res = await fetch("/api/questions/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        subject_id: subjectId || null,
        notebook: {
          name: parseResult.name,
          share_url: parseResult.share_url,
          ordering: parseResult.ordering,
          warnings: parseResult.warnings,
        },
        questions: questions.map((q) => q.merged),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Falha ao salvar")
      setLoading(false)
      return
    }
    setCommitResult(data)
    setStep(3)
    setLoading(false)
  }

  const steps: { n: WizardStep; label: string }[] = [
    { n: 1, label: "Analisar" },
    { n: 2, label: "Revisar" },
    { n: 3, label: "Salvar" },
  ]

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/questoes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold">Importar PDF do TEC</h1>
      <p className="mt-2 text-sm text-slate-600">
        Analise o PDF com três parsers, revise as questões e só então salve no banco.
      </p>

      <div className="mt-6 flex gap-2">
        {steps.map(({ n, label }) => (
          <div
            key={n}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium ${
              step === n
                ? "border-slate-900 bg-slate-900 text-white"
                : step > n
                  ? "border-green-300 bg-green-50 text-green-800"
                  : "border-slate-200 bg-slate-50 text-slate-500"
            }`}
          >
            {step > n ? <Check className="h-3 w-3" /> : null}
            {n}. {label}
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Arquivo PDF</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                resetWizard()
              }}
              className="mt-1 block w-full text-sm"
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
          <button
            type="button"
            onClick={handleParse}
            disabled={!file || loading}
            className="inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {loading ? "Analisando PDF…" : "Analisar PDF"}
          </button>

          {parseResult && (
            <div className="rounded-lg border bg-slate-50 p-4 text-sm">
              <p className="font-medium text-slate-900">Caderno: {parseResult.name}</p>
              <p className="mt-1">Questões: {parseResult.stats.total}</p>
              <p className="text-slate-600">
                Confiança — alta: {parseResult.stats.high}, média:{" "}
                {parseResult.stats.medium}, baixa: {parseResult.stats.low}
              </p>
              {parseResult.warnings.length > 0 && (
                <ul className="mt-2 text-xs text-amber-700">
                  {parseResult.warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {parseResult.warnings.length > 5 && (
                    <li>… e mais {parseResult.warnings.length - 5}</li>
                  )}
                </ul>
              )}
              <button
                type="button"
                onClick={() => {
                  setStep(2)
                  setPage(0)
                }}
                disabled={parseResult.stats.total === 0}
                className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Continuar para revisão
              </button>
            </div>
          )}
        </div>
      )}

      {step === 2 && parseResult && userId && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={filterLow}
                onChange={(e) => {
                  setFilterLow(e.target.checked)
                  setPage(0)
                }}
              />
              Só baixa confiança
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={filterWarnings}
                onChange={(e) => {
                  setFilterWarnings(e.target.checked)
                  setPage(0)
                }}
              />
              Só com avisos
            </label>
            <input
              type="text"
              placeholder="Buscar TEC ID"
              value={searchTecId}
              onChange={(e) => {
                setSearchTecId(e.target.value)
                setPage(0)
              }}
              className="rounded border px-2 py-1 text-sm"
            />
          </div>

          {missingGabarito.length > 0 && (
            <p className="text-sm text-red-700">
              {missingGabarito.length} questão(ões) sem gabarito — corrija antes de salvar.
            </p>
          )}

          <div className="space-y-4">
            {pageItems.map((item) => (
              <ImportQuestionReviewCard
                key={item.tec_id}
                item={item}
                userId={userId}
                llmEnabled={LLM_ENABLED}
                onChange={(merged) => updateQuestion(item.tec_id, merged)}
              />
            ))}
          </div>

          {filteredQuestions.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma questão com os filtros atuais.</p>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="inline-flex items-center gap-1 rounded border px-3 py-1 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <span>
                Página {page + 1} de {pageCount} ({filteredQuestions.length} questões)
              </span>
              <button
                type="button"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded border px-3 py-1 disabled:opacity-40"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded border px-4 py-2 text-sm"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={questions.length === 0}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Ir para confirmação
            </button>
          </div>
        </div>
      )}

      {step === 3 && parseResult && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border bg-slate-50 p-4 text-sm">
            <p className="font-medium">Caderno: {parseResult.name}</p>
            <p className="mt-1">Questões a importar: {questions.length}</p>
            <p className="text-slate-600">
              Alta confiança: {parseResult.stats.high} · Revisadas manualmente:{" "}
              {questions.length - parseResult.stats.high}
            </p>
            {subjectId && subjects.length > 0 && (
              <p className="mt-1 text-slate-600">
                Matéria: {subjects.find((s) => s.id === subjectId)?.name ?? "—"}
              </p>
            )}
          </div>

          {!commitResult ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded border px-4 py-2 text-sm"
              >
                Voltar à revisão
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={loading || missingGabarito.length > 0}
                className="inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Adicionar ao banco
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
              <p className="font-medium text-green-900">Importação concluída!</p>
              <p className="mt-1">Novas questões: {String(commitResult.created_questions ?? 0)}</p>
              <p>Reutilizadas: {String(commitResult.reused_questions ?? 0)}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {typeof commitResult.notebook_id === "string" && (
                  <Link
                    href={`/questoes/cadernos/${commitResult.notebook_id}`}
                    className="text-blue-600 underline"
                  >
                    Abrir caderno
                  </Link>
                )}
                <Link href="/questoes/importados" className="text-blue-600 underline">
                  Ver em Importados
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    resetWizard()
                  }}
                  className="text-blue-600 underline"
                >
                  Importar outro PDF
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
