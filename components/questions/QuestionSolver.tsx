"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { BarChart2, ExternalLink, Flag } from "lucide-react"
import AddErrorModal from "@/components/AddErrorModal"
import QuickNote from "@/components/questions/QuickNote"
import PerformanceModal from "@/components/questions/PerformanceModal"

type Question = {
  id: string
  tec_id: number
  tec_url: string
  type: string
  banca: string | null
  cargo: string | null
  orgao: string | null
  ano: number | null
  tec_subject: string | null
  tec_topic: string | null
  statement: string
  correct_answer: string
}

type Option = { label: string; text: string }

type Props = {
  userId: string
  mode: "notebook" | "study"
  notebookId?: string
  studySessionId?: string
  fetchQueue: () => Promise<{
    current: { question_id: string; tec_id: number; notebook_id: string } | null
    question: Question | null
    options: Option[]
    stats: { total: number; resolved: number; correct: number; wrong: number; pending: number }
    child_progress?: { notebook_id: string; total: number; answered: number; notebooks?: { name: string } }[]
  }>
  submitAnswer: (payload: {
    question_id: string
    selected_answer: string
    duration_ms: number
    tec_id: number
    notebook_id?: string
  }) => Promise<{ is_correct: boolean; correct_answer: string; tec_url: string }>
  mapping?: { subject_id: string; topic_id: string } | null
}

export default function QuestionSolver({
  userId,
  mode,
  notebookId,
  studySessionId,
  fetchQueue,
  submitAnswer,
  mapping,
}: Props) {
  const [question, setQuestion] = useState<Question | null>(null)
  const [options, setOptions] = useState<Option[]>([])
  const [stats, setStats] = useState({ total: 0, resolved: 0, correct: 0, wrong: 0, pending: 0 })
  const [current, setCurrent] = useState<{
    question_id: string
    tec_id: number
    notebook_id: string
  } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<{
    is_correct: boolean
    correct_answer: string
    tec_url: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPerf, setShowPerf] = useState(false)
  const [showError, setShowError] = useState(false)
  const startRef = useRef<number>(Date.now())

  const load = useCallback(async () => {
    setLoading(true)
    setSelected(null)
    setResult(null)
    startRef.current = Date.now()
    const data = await fetchQueue()
    setCurrent(data.current)
    setQuestion(data.question)
    let opts = (data.options ?? []).map((o: { label: string; text: string }) => ({
      label: o.label,
      text: o.text,
    }))
    if (data.question?.type === "certo_errado" && opts.length === 0) {
      opts = [
        { label: "Certo", text: "Certo" },
        { label: "Errado", text: "Errado" },
      ]
    }
    setOptions(opts)
    setStats(data.stats)
    setLoading(false)
  }, [fetchQueue])

  useEffect(() => {
    load()
  }, [load])

  async function handleSelect(answer: string) {
    if (!question || !current || result) return
    setSelected(answer)
    const duration_ms = Date.now() - startRef.current
    const res = await submitAnswer({
      question_id: question.id,
      selected_answer: answer,
      duration_ms,
      tec_id: current.tec_id,
      notebook_id: current.notebook_id,
    })
    setResult(res)
    setStats((s) => ({
      ...s,
      resolved: s.resolved + 1,
      correct: s.correct + (res.is_correct ? 1 : 0),
      wrong: s.wrong + (res.is_correct ? 0 : 1),
      pending: Math.max(0, s.pending - 1),
    }))
  }

  function next() {
    load()
  }

  if (loading) {
    return <p className="p-8 text-slate-500">Carregando questão...</p>
  }

  if (!question || !current) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
        <p className="text-lg font-medium text-green-800">Caderno / sessão concluído!</p>
        {mode === "notebook" && notebookId && (
          <Link href={`/questoes/materia`} className="mt-4 inline-block text-blue-600">
            Voltar
          </Link>
        )}
      </div>
    )
  }

  const idx = stats.resolved + 1
  const meta = [question.banca, question.cargo, question.orgao, question.ano]
    .filter(Boolean)
    .join(" - ")

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-600">
          Questão {idx} de {stats.total} ({stats.resolved} resolvidas, {stats.correct} acertos e{" "}
          {stats.wrong} erros)
        </p>
        <p className="mt-1 text-sm">
          <span className="text-slate-500">Matéria:</span> {question.tec_subject}
          {" · "}
          <span className="text-slate-500">Assunto:</span> {question.tec_topic}
        </p>
        <p className="mt-2 rounded bg-slate-100 px-3 py-1 text-xs text-slate-600">
          <a
            href={question.tec_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            #{question.tec_id}
          </a>
          {" · "}
          {meta}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setShowPerf(true)}
            className="flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            <BarChart2 className="h-4 w-4" /> Desempenho
          </button>
          <button
            type="button"
            onClick={() => setShowError(true)}
            className="flex items-center gap-1 rounded border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            <Flag className="h-4 w-4" /> Adicionar erro
          </button>
        </div>
        <div className="mt-6 whitespace-pre-wrap text-slate-800">{question.statement}</div>
        <div className="mt-6 space-y-2">
          {options.map((opt) => {
            const isSelected = selected === opt.label
            const showCorrect =
              result && opt.label.toLowerCase() === result.correct_answer.toLowerCase()
            const showWrong = result && isSelected && !result.is_correct
            return (
              <button
                key={opt.label}
                type="button"
                disabled={!!result}
                onClick={() => handleSelect(opt.label)}
                className={`block w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                  showCorrect
                    ? "border-green-400 bg-green-50"
                    : showWrong
                      ? "border-red-400 bg-red-50"
                      : isSelected
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="font-medium">{opt.label})</span> {opt.text}
              </button>
            )
          })}
        </div>
        {result && (
          <div
            className={`mt-4 rounded-lg p-4 ${result.is_correct ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
          >
            {result.is_correct ? "Você acertou!" : `Você errou! Gabarito: ${result.correct_answer}.`}
            <a
              href={result.tec_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1 text-blue-600 underline"
            >
              Ver no TEC <ExternalLink className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={next}
              className="mt-3 block rounded bg-slate-900 px-4 py-2 text-sm text-white"
            >
              Próxima questão
            </button>
          </div>
        )}
      </div>
      <aside className="w-full shrink-0 lg:w-72">
        <QuickNote questionId={question.id} userId={userId} />
      </aside>
      {showPerf && (
        <PerformanceModal
          questionId={question.id}
          userId={userId}
          onClose={() => setShowPerf(false)}
        />
      )}
      <AddErrorModal
        isOpen={showError}
        onClose={() => setShowError(false)}
        initialData={
          mapping
            ? {
                id: "",
                topic_id: mapping.topic_id,
                subject_id: mapping.subject_id,
                error_text: "",
                correction_text: "",
                description: question.statement.slice(0, 500),
                reference_link: question.tec_url,
              }
            : undefined
        }
      />
    </div>
  )
}
