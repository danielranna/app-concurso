"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2 } from "lucide-react"
import {
  OUTCOME_CATEGORY_LABELS,
  SIGNAL_LABELS,
} from "@/lib/coach-labels"
import type { BrainTopicQuestionRow } from "@/lib/ai/brain-detail"
import PerformanceModal from "@/components/questions/PerformanceModal"

type Props = {
  userId: string
  subjectId: string
  topicKey: string
  topicLabel: string
}

export default function BrainTopicQuestionsPanel({
  userId,
  subjectId,
  topicKey,
  topicLabel,
}: Props) {
  const [questions, setQuestions] = useState<BrainTopicQuestionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [perfQuestionId, setPerfQuestionId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      user_id: userId,
      subject_id: subjectId,
      topic_key: topicKey,
    })
    fetch(`/api/coach/brain/topic-questions?${params}`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []))
      .finally(() => setLoading(false))
  }, [userId, subjectId, topicKey])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 pl-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando questões de «{topicLabel}»…
      </div>
    )
  }

  if (!questions.length) {
    return (
      <p className="py-3 pl-8 text-sm text-slate-500">
        Nenhuma tentativa registrada neste assunto.
      </p>
    )
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
      <p className="mb-2 text-xs font-medium text-slate-600">
        {questions.length} questão{questions.length === 1 ? "" : "ões"} neste assunto
      </p>
      <ul className="space-y-2">
        {questions.map((q) => {
          const bankParams = new URLSearchParams()
          if (q.tec_subject) bankParams.set("tec_subject", q.tec_subject)
          if (q.tec_topic) bankParams.set("tec_topic", q.tec_topic)
          return (
            <li
              key={q.question_id}
              className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
            >
              <p className="line-clamp-2 text-slate-800">
                {q.statement_excerpt || `Questão ${q.tec_id}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span
                  className={
                    q.last_is_correct ? "text-green-700" : "text-red-700"
                  }
                >
                  Última: {q.last_is_correct ? "acerto" : "erro"} · {q.attempt_count}{" "}
                  tentativa{q.attempt_count === 1 ? "" : "s"} ({q.wrong_count} erro
                  {q.wrong_count === 1 ? "" : "s"})
                </span>
                {q.last_outcome_category && (
                  <span className="text-slate-500">
                    {OUTCOME_CATEGORY_LABELS[q.last_outcome_category] ??
                      q.last_outcome_category}
                  </span>
                )}
                {q.signal_types.map((st) => (
                  <span
                    key={st}
                    className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900"
                  >
                    {SIGNAL_LABELS[st]}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPerfQuestionId(q.question_id)}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Ver desempenho
                </button>
                {q.tec_subject && (
                  <Link
                    href={`/questoes/banco?${bankParams.toString()}`}
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-600 hover:underline"
                  >
                    Banco
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {perfQuestionId && (
        <PerformanceModal
          questionId={perfQuestionId}
          userId={userId}
          onClose={() => setPerfQuestionId(null)}
        />
      )}
    </div>
  )
}
