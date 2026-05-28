"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Loader2, Shuffle } from "lucide-react"
import QuestionOptions from "@/components/questions/QuestionOptions"
import ConfidenceToggles from "@/components/questions/ConfidenceToggles"
import QuestionContentDisplay from "@/components/questions/QuestionContentDisplay"
import { resolveQuestionContentBlocks } from "@/lib/question-content-blocks"
import type { ConfidenceLevel } from "@/lib/question-types"
import { clearDraftScope, draftScopeKey } from "@/lib/question-draft-cache"

type Question = {
  id: string
  tec_id: number
  tec_url: string
  type: string
  tec_subject: string | null
  tec_topic: string | null
  statement: string
  correct_answer: string
  content_before?: string | null
  content_after?: string | null
  content_blocks?: unknown
}

type Option = { label: string; text: string }

type Props = {
  userId: string
}

export default function HomeWrongQuestion({ userId }: Props) {
  const [poolCount, setPoolCount] = useState(0)
  const [question, setQuestion] = useState<Question | null>(null)
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<ConfidenceLevel>("seguro")
  const [locked, setLocked] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [result, setResult] = useState<{
    is_correct: boolean
    correct_answer: string
    tec_url: string
  } | null>(null)
  const startedAt = useRef(Date.now())

  const loadRandom = useCallback(
    async (excludeId?: string) => {
      setLoading(true)
      setSelected(null)
      setLocked(false)
      setResult(null)
      setConfidence("seguro")
      startedAt.current = Date.now()

      const params = new URLSearchParams({ user_id: userId })
      if (excludeId) params.set("exclude", excludeId)

      const res = await fetch(`/api/questions/wrong-random?${params}`)
      const data = await res.json()
      setLoading(false)
      setPoolCount(data.pool_count ?? 0)

      if (!data.question) {
        setQuestion(null)
        setOptions([])
        return
      }

      if (data.question_id) {
        clearDraftScope(draftScopeKey("solo", data.question_id))
      }
      setQuestion(data.question)
      setOptions(data.options ?? [])
    },
    [userId]
  )

  useEffect(() => {
    loadRandom()
  }, [loadRandom])

  async function handleResolve() {
    if (!question || !selected || locked) return
    setResolving(true)
    const duration_ms = Date.now() - startedAt.current
    const res = await fetch(`/api/questions/${question.id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        selected_answer: selected,
        duration_ms,
        confidence_level: confidence,
      }),
    })
    const data = await res.json()
    setResolving(false)
    if (!res.ok) return
    setLocked(true)
    setResult({
      is_correct: data.is_correct,
      correct_answer: data.correct_answer,
      tec_url: data.tec_url,
    })
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Repetição infinita</h2>
          <p className="text-sm text-slate-500">
            Questões que você errou por último
            {poolCount > 0 ? ` · ${poolCount} no banco` : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={loading || poolCount === 0}
          onClick={() => loadRandom(question?.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Shuffle className="h-4 w-4" />
          Outra errada
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : poolCount === 0 ? (
        <p className="rounded-lg bg-slate-50 py-6 text-center text-sm text-slate-600">
          Nenhuma questão com última tentativa errada. Resolva cadernos em{" "}
          <Link href="/questoes" className="font-medium text-blue-600 hover:underline">
            Questões
          </Link>
          .
        </p>
      ) : question ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {question.tec_subject} · {question.tec_topic}
          </p>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-4">
            <QuestionContentDisplay
              blocks={resolveQuestionContentBlocks({
                content_blocks: question.content_blocks as never,
                content_before: question.content_before,
                content_after: question.content_after,
              })}
              statement={question.statement}
            />
          </div>

          <QuestionOptions
            options={options}
            questionType={question.type}
            selected={selected}
            eliminated={new Set()}
            locked={locked}
            result={result}
            onSelect={setSelected}
            onToggleEliminated={() => {}}
          />

          <ConfidenceToggles
            value={confidence}
            disabled={locked}
            onChange={setConfidence}
          />

          {!locked ? (
            <button
              type="button"
              onClick={handleResolve}
              disabled={!selected || resolving}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {resolving ? "Enviando…" : "Resolver"}
            </button>
          ) : (
            <div className="space-y-3">
              <div
                className={`rounded-lg p-3 text-sm ${
                  result?.is_correct
                    ? "bg-green-50 text-green-800"
                    : "bg-red-50 text-red-800"
                }`}
              >
                {result?.is_correct
                  ? "Acertou!"
                  : `Errou. Gabarito: ${result?.correct_answer}`}
              </div>
              <button
                type="button"
                onClick={() => loadRandom(question.id)}
                className="w-full rounded-lg border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50"
              >
                Próxima errada →
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
