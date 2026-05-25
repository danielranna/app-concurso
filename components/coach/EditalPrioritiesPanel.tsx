"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Sparkles, FileUp } from "lucide-react"
import type { EditalSubjectRankRow, ExamPlanStructured } from "@/lib/coach-types"

type EditalDocRow = {
  id: string
  title: string
  status?: string
}

type AnalysisRow = {
  id: string
  structure?: { subjects?: { name: string }[] }
  priorities?: ExamPlanStructured
  subject_rank?: EditalSubjectRankRow[]
  model_used?: string
  analyzed_at?: string
}

function SubjectChipList({
  title,
  items,
  className,
}: {
  title: string
  items: { name: string; why?: string }[]
  className: string
}) {
  if (!items.length) return null
  return (
    <div className={`rounded-lg border p-3 ${className}`}>
      <h4 className="mb-2 text-sm font-semibold text-slate-900">{title}</h4>
      <ul className="space-y-1.5 text-sm">
        {items.map((s) => (
          <li key={s.name}>
            <span className="font-medium text-slate-900">{s.name}</span>
            {s.why && <span className="text-slate-600"> — {s.why}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function EditalPrioritiesPanel({
  userId,
  examTargetId,
  examName,
  hasIncidenceExcel,
  onAnalysisDone,
}: {
  userId: string
  examTargetId: string
  examName: string
  hasIncidenceExcel?: boolean
  onAnalysisDone?: () => void
}) {
  const [editalDoc, setEditalDoc] = useState<EditalDocRow | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const loadEditalDoc = useCallback(() => {
    return fetch(
      `/api/coach/documents?user_id=${userId}&exam_target_id=${examTargetId}&doc_type=edital`
    )
      .then((r) => r.json())
      .then((docs: EditalDocRow[]) => {
        setEditalDoc((docs ?? [])[0] ?? null)
      })
  }, [userId, examTargetId])

  const loadAnalysis = useCallback(() => {
    setLoading(true)
    return fetch(
      `/api/coach/exam-targets/${examTargetId}/analyze-edital?user_id=${userId}`
    )
      .then((r) => r.json())
      .then((d) => {
        setAnalysis(d.analysis ?? null)
      })
      .finally(() => setLoading(false))
  }, [userId, examTargetId])

  useEffect(() => {
    loadEditalDoc()
    loadAnalysis()
  }, [loadEditalDoc, loadAnalysis])

  async function uploadEditalPdf(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      alert("PDF muito grande (máx. 15 MB).")
      return
    }
    setUploadingPdf(true)
    const form = new FormData()
    form.set("user_id", userId)
    form.set("exam_target_id", examTargetId)
    form.set("doc_type", "edital")
    form.set("file", file)
    form.set("title", file.name)

    try {
      const res = await fetch("/api/coach/documents/upload", {
        method: "POST",
        body: form,
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        alert(data.error ?? `Erro (${res.status})`)
      } else {
        await loadEditalDoc()
        alert("PDF do edital enviado. Clique em Analisar com IA.")
      }
    } catch {
      alert("Falha no envio do PDF.")
    } finally {
      setUploadingPdf(false)
    }
  }

  async function runAnalysis() {
    if (!editalDoc) {
      alert("Envie o PDF do edital antes de analisar.")
      return
    }
    setAnalyzing(true)
    try {
      const res = await fetch(
        `/api/coach/exam-targets/${examTargetId}/analyze-edital`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        }
      )
      const data = await res.json()
      if (data.error) {
        alert(data.error)
      } else {
        await loadAnalysis()
        onAnalysisDone?.()
        const n =
          data.edital_subjects_count ??
          data.subject_rank?.length ??
          "?"
        alert(
          `Análise salva (${data.model_used ?? "IA"}). Ranking com ${n} matérias do edital.`
        )
      }
    } catch {
      alert("Falha na análise do edital.")
    } finally {
      setAnalyzing(false)
    }
  }

  const priorities = analysis?.priorities as ExamPlanStructured | undefined
  const rank: EditalSubjectRankRow[] =
    analysis?.subject_rank?.length
      ? analysis.subject_rank
      : priorities?.subject_priority_rank ?? []
  const editalSubjectsInStructure = analysis?.structure?.subjects?.length ?? 0

  return (
    <section className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/30 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Edital (PDF) + análise IA</h3>
          <p className="text-sm text-slate-600">
            Envie o PDF do edital de <strong>{examName}</strong>. A IA gera o ranking
            completo de todas as matérias e salva no banco (associações com incidência e
            suas matérias virão depois).
          </p>
          {editalDoc ? (
            <p className="mt-1 text-xs text-violet-800">PDF: {editalDoc.title}</p>
          ) : (
            <p className="mt-1 text-xs text-amber-800">Nenhum PDF do edital enviado.</p>
          )}
          {analysis?.model_used && (
            <p className="mt-1 text-xs text-slate-500">
              Última análise: {analysis.model_used}
              {analysis.analyzed_at &&
                ` · ${new Date(analysis.analyzed_at).toLocaleString("pt-BR")}`}
              {rank.length > 0 && ` · ${rank.length} matérias salvas`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-violet-600 bg-white px-4 py-2 text-sm font-medium text-violet-800 hover:bg-violet-50">
            <FileUp className="h-4 w-4" />
            {uploadingPdf
              ? "Enviando…"
              : editalDoc
                ? "Substituir PDF"
                : "Enviar PDF do edital"}
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="sr-only"
              disabled={uploadingPdf}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadEditalPdf(f)
                e.target.value = ""
              }}
            />
          </label>
          <button
            type="button"
            onClick={runAnalysis}
            disabled={analyzing || !editalDoc}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Analisar com IA
          </button>
        </div>
      </div>

      {!hasIncidenceExcel && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dica: importe o Excel de incidência acima para enriquecer a coluna de incidência
          da banca no ranking.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando análise…
        </div>
      ) : !rank.length ? (
        <div className="rounded-lg border border-dashed border-violet-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-600">
          {editalDoc
            ? 'Clique em "Analisar com IA" para gerar e salvar o ranking de todas as matérias.'
            : "Envie o PDF do edital e depois analise com IA."}
        </div>
      ) : (
        <div className="space-y-5">
          {priorities?.headline && (
            <p className="rounded-lg bg-white px-4 py-3 text-sm font-medium text-slate-800">
              {priorities.headline}
            </p>
          )}

          {priorities?.edital_summary && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h4 className="mb-2 text-sm font-semibold text-slate-900">
                Resumo do edital
              </h4>
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {priorities.edital_summary}
              </p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <SubjectChipList
              title="Matérias prioritárias"
              items={priorities?.priority_subjects ?? []}
              className="border-emerald-200 bg-emerald-50/50"
            />
            <SubjectChipList
              title="Matérias secundárias"
              items={priorities?.secondary_subjects ?? []}
              className="border-slate-200 bg-slate-50/80"
            />
            <SubjectChipList
              title="Possíveis armadilhas"
              items={priorities?.trap_subjects ?? []}
              className="border-amber-200 bg-amber-50/50"
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900">
                Ranking de relevância das matérias
              </h4>
              <p className="text-xs text-slate-500">
                {rank.length} matérias
                {editalSubjectsInStructure > 0 &&
                  editalSubjectsInStructure !== rank.length &&
                  ` · ${editalSubjectsInStructure} extraídas do PDF`}
                {" · salvo no banco"}
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-violet-200 bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-violet-50 text-left text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Matéria</th>
                    <th className="px-3 py-2">Peso</th>
                    <th className="px-3 py-2">Quest.</th>
                    <th className="px-3 py-2">%</th>
                    <th className="px-3 py-2">Prova</th>
                    <th className="px-3 py-2">Impacto</th>
                    <th className="px-3 py-2">Incidência banca</th>
                  </tr>
                </thead>
                <tbody>
                  {rank.map((item) => (
                    <tr
                      key={`${item.priority}-${item.subject_name}`}
                      className="border-t border-slate-100"
                    >
                      <td className="px-3 py-2 font-bold text-violet-700">
                        {item.priority}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">
                          {item.subject_name}
                        </p>
                        <p className="text-xs text-slate-600">{item.why}</p>
                        {item.tiebreaker_note && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            Desempate: {item.tiebreaker_note}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {item.edital_weight ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {item.question_count ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {item.percent_of_total != null
                          ? `${item.percent_of_total}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {item.prova ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {item.impact_on_final_score ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-emerald-800">
                        {item.incidence_summary ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {priorities?.strategic_conclusions?.length ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h4 className="mb-2 text-sm font-semibold text-slate-900">
                Conclusões estratégicas
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {priorities.strategic_conclusions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {priorities?.risks_if_ignored?.length ? (
            <div className="rounded-lg border border-red-100 bg-red-50/40 p-4">
              <h4 className="mb-2 text-sm font-semibold text-red-900">
                Riscos se ignorar
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-800">
                {priorities.risks_if_ignored.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
