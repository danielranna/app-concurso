"use client"

import { useState } from "react"
import { Loader2, X } from "lucide-react"
import PerformanceModal from "@/components/questions/PerformanceModal"
import { SequencePatternBadge } from "@/components/questions/SequencePatternBadge"
import {
  OUTCOME_CATEGORY_LABELS,
  ERROR_TAXONOMY_LABELS,
} from "@/lib/coach-labels"
import type { AnalysisQuestionRow } from "@/lib/question-statistics-analysis"
import type { ErrorTaxonomy } from "@/lib/coach-types"

type Props = {
  question: AnalysisQuestionRow
  userId: string
  onClose: () => void
  onPractice: (
    questionIds: string[],
    name: string,
    subjectId: string
  ) => Promise<void>
  practicing: boolean
}

export default function AnalysisQuestionPanel({
  question,
  userId,
  onClose,
  onPractice,
  practicing,
}: Props) {
  const [showPerf, setShowPerf] = useState(false)

  const outcomeLabel = question.dominant_outcome
    ? OUTCOME_CATEGORY_LABELS[question.dominant_outcome] ??
      question.dominant_outcome
    : null
  const taxLabel = question.dominant_taxonomy
    ? ERROR_TAXONOMY_LABELS[
        question.dominant_taxonomy as ErrorTaxonomy
      ] ?? question.dominant_taxonomy
    : null

  const canPractice = Boolean(question.subject_id)

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
                Questão
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-slate-900">
                {question.wrong_count}× errada · {question.correct_pct}% acerto
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <SequencePatternBadge pattern={question.sequence_pattern} />
                {question.sequence_preview ? (
                  <span className="font-mono text-xs text-slate-500">
                    {question.sequence_preview}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto px-4 py-4">
            <p className="text-sm leading-relaxed text-slate-700">
              {question.statement_preview || "Sem enunciado disponível."}
              {question.statement_preview.length >= 160 ? "…" : ""}
            </p>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Matéria</dt>
                <dd className="font-medium text-slate-800">
                  {question.subject_name}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Assunto</dt>
                <dd className="font-medium text-slate-800">{question.tec_topic}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tentativas</dt>
                <dd className="font-medium tabular-nums text-slate-800">
                  {question.attempt_count}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Erros</dt>
                <dd className="font-medium tabular-nums text-red-600">
                  {question.wrong_count}
                </dd>
              </div>
              {outcomeLabel && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Outcome dominante</dt>
                  <dd className="font-medium text-slate-800">{outcomeLabel}</dd>
                </div>
              )}
              {taxLabel && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Tipo de erro dominante</dt>
                  <dd className="font-medium text-slate-800">{taxLabel}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              onClick={() => setShowPerf(true)}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Ver desempenho
            </button>
            <button
              type="button"
              disabled={!canPractice || practicing}
              onClick={() => {
                if (!question.subject_id) return
                void onPractice(
                  [question.question_id],
                  "Prática — questão recorrente",
                  question.subject_id
                )
              }}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {practicing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Praticar esta
            </button>
          </div>
          {!canPractice && (
            <p className="px-4 pb-3 text-xs text-amber-700">
              Associe a questão a uma matéria para criar um caderno de prática.
            </p>
          )}
        </div>
      </div>

      {showPerf && (
        <PerformanceModal
          questionId={question.question_id}
          userId={userId}
          onClose={() => setShowPerf(false)}
        />
      )}
    </>
  )
}
