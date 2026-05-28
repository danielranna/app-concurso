"use client"

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import type { ParsedTecQuestion } from "@/lib/question-types"
import type { QuestionParseResult, ParseSource } from "@/lib/tec-pdf-parse-merge"

const MCQ_LABELS = ["A", "B", "C", "D", "E"]
const SOURCES: ParseSource[] = ["primary", "lines", "strict"]

type Props = {
  item: QuestionParseResult
  userId: string
  llmEnabled: boolean
  onChange: (merged: ParsedTecQuestion) => void
}

const confidenceStyles = {
  high: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-red-100 text-red-800 border-red-200",
}

const confidenceLabels = {
  high: "Alta confiança",
  medium: "Média confiança",
  low: "Baixa confiança",
}

export default function ImportQuestionReviewCard({
  item,
  userId,
  llmEnabled,
  onChange,
}: Props) {
  const q = item.merged
  const [expanded, setExpanded] = useState(
    item.needs_review || item.confidence !== "high"
  )
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmSuggestion, setLlmSuggestion] = useState<{
    question: ParsedTecQuestion
    explanation: string
  } | null>(null)
  const [llmError, setLlmError] = useState<string | null>(null)
  const [showCandidates, setShowCandidates] = useState(false)

  function update(field: keyof ParsedTecQuestion, value: string) {
    onChange({ ...q, [field]: value })
  }

  function updateOption(idx: number, text: string) {
    const options = [...q.options]
    options[idx] = { ...options[idx], text }
    onChange({ ...q, options })
  }

  async function resolveWithLlm() {
    setLlmLoading(true)
    setLlmError(null)
    setLlmSuggestion(null)
    try {
      const res = await fetch("/api/questions/import/resolve-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          raw_block: item.raw_block,
          candidates: item.candidates,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha na IA")
      setLlmSuggestion({
        question: { ...data.question, index: q.index, tec_id: q.tec_id },
        explanation: data.explanation,
      })
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : "Erro na IA")
    } finally {
      setLlmLoading(false)
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="text-xs text-slate-500">#{q.index}</span>
          <span className="ml-2 font-mono text-sm text-slate-700">TEC {q.tec_id}</span>
          <span
            className={`ml-2 rounded border px-2 py-0.5 text-xs font-medium ${confidenceStyles[item.confidence]}`}
          >
            {confidenceLabels[item.confidence]}
          </span>
          {item.needs_review && (
            <span className="ml-2 rounded border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-900">
              Revisar conteúdo
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {llmEnabled && (
            <button
              type="button"
              onClick={resolveWithLlm}
              disabled={llmLoading}
              className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs text-violet-800"
            >
              {llmLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Resolver com IA
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-blue-600 underline"
          >
            {expanded ? "Recolher" : "Expandir"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-600">
        {q.tec_subject}
        {q.tec_topic ? ` · ${q.tec_topic}` : ""}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {q.banca} — {q.cargo}
        {q.orgao ? ` / ${q.orgao}` : ""}
        {q.ano ? ` (${q.ano})` : ""}
      </p>

      {item.quality_flags.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {item.quality_flags.map((f) => (
            <li
              key={f.code}
              className={
                f.severity === "error" ? "text-red-700" : "text-orange-800"
              }
            >
              {f.message}
            </li>
          ))}
        </ul>
      )}

      {item.warnings.length > 0 && (
        <ul className="mt-2 text-xs text-amber-700">
          {item.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {item.parser_notes.length > 0 && (
        <ul className="mt-1 text-xs text-slate-500">
          {item.parser_notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {expanded && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Matéria TEC</label>
            <input
              value={q.tec_subject}
              onChange={(e) => update("tec_subject", e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Assunto TEC</label>
            <input
              value={q.tec_topic}
              onChange={(e) => update("tec_topic", e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Enunciado</label>
            <textarea
              value={q.statement}
              onChange={(e) => update("statement", e.target.value)}
              rows={8}
              className="mt-1 w-full whitespace-pre-wrap rounded border px-2 py-1 font-sans text-sm leading-relaxed"
            />
          </div>

          {q.type === "multiple_choice" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600">Alternativas</label>
              {(q.options.length ? q.options : MCQ_LABELS.map((l) => ({ label: l, text: "" }))).map(
                (opt, idx) => (
                  <div key={opt.label} className="flex gap-2">
                    <span className="w-6 pt-2 text-sm font-medium">{opt.label})</span>
                    <textarea
                      value={opt.text}
                      onChange={(e) => updateOption(idx, e.target.value)}
                      rows={2}
                      className="flex-1 rounded border px-2 py-1 text-sm"
                    />
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Certo / Errado</p>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600">Gabarito</label>
            <input
              value={q.correct_answer}
              onChange={(e) => update("correct_answer", e.target.value)}
              className="mt-1 w-32 rounded border px-2 py-1 text-sm font-medium"
            />
          </div>

          {item.conflicts.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3">
              <button
                type="button"
                onClick={() => setShowCandidates((v) => !v)}
                className="text-xs font-medium text-amber-900 underline"
              >
                {showCandidates ? "Ocultar" : "Ver"} discordâncias entre parsers (
                {item.conflicts.length})
              </button>
              {showCandidates && (
                <div className="mt-2 space-y-2">
                  {item.conflicts.map((c) => (
                    <div key={c.field} className="text-xs">
                      <p className="font-medium text-amber-900">{c.field}</p>
                      {SOURCES.map((src) =>
                        c.values[src] ? (
                          <p key={src} className="text-amber-800">
                            <span className="font-mono">{src}:</span> {c.values[src]}
                          </p>
                        ) : null
                      )}
                    </div>
                  ))}
                  <div className="mt-2 border-t border-amber-200 pt-2">
                    <p className="text-xs font-medium text-amber-900">Candidatos completos</p>
                    {SOURCES.map((src) => {
                      const cand = item.candidates[src]
                      if (!cand) return null
                      return (
                        <details key={src} className="mt-1 text-xs text-amber-800">
                          <summary className="cursor-pointer font-mono">{src}</summary>
                          <p className="mt-1 whitespace-pre-wrap">{cand.statement.slice(0, 500)}</p>
                          <p className="mt-1">Gabarito: {cand.correct_answer || "—"}</p>
                        </details>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {llmError && <p className="text-xs text-red-700">{llmError}</p>}
          {llmSuggestion && (
            <div className="rounded border border-violet-200 bg-violet-50 p-3 text-sm">
              <p className="text-xs text-violet-800">{llmSuggestion.explanation}</p>
              <p className="mt-2 line-clamp-3 text-slate-700">
                {llmSuggestion.question.statement.slice(0, 300)}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange(llmSuggestion.question)
                    setLlmSuggestion(null)
                  }}
                  className="rounded bg-violet-700 px-3 py-1 text-xs text-white"
                >
                  Aceitar sugestão
                </button>
                <button
                  type="button"
                  onClick={() => setLlmSuggestion(null)}
                  className="rounded border px-3 py-1 text-xs"
                >
                  Descartar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!expanded && (
        <p className="mt-2 line-clamp-2 text-sm text-slate-800">{q.statement}</p>
      )}
    </div>
  )
}
