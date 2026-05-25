"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import type { ExamStrategyBoard } from "@/lib/ai/exam-strategy-board"

export default function ExamStrategyBoardPanel({
  userId,
  examTargetId,
  examName,
}: {
  userId: string
  examTargetId: string
  examName: string
}) {
  const [board, setBoard] = useState<ExamStrategyBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set())

  const load = useCallback(
    (refresh = false) => {
      if (refresh) setRefreshing(true)
      else setLoading(true)
      fetch(
        `/api/coach/exam-targets/${examTargetId}/strategy-board?user_id=${userId}${refresh ? "&refresh=1" : ""}`
      )
        .then((r) => r.json())
        .then((d) => {
          if (d.error) alert(d.error)
          else {
            setBoard(d)
            setOpenSubjects(
              new Set((d.subjects ?? []).slice(0, 3).map((s: { subject_id: string }) => s.subject_id))
            )
          }
        })
        .finally(() => {
          setLoading(false)
          setRefreshing(false)
        })
    },
    [userId, examTargetId]
  )

  useEffect(() => {
    load(false)
  }, [load])

  function toggleSubject(id: string) {
    setOpenSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Montando painel estratégico…
      </div>
    )
  }

  const parseStats = board?.parse_stats as {
    subjects?: number
    topics?: number
    subtopics?: number
    rows_imported?: number
    rows_ignored?: number
  } | null

  if (!board?.subjects?.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
        {parseStats && (
          <p className="mb-2 text-xs text-emerald-700">
            Importadas: {parseStats.subjects ?? 0} matérias, {parseStats.topics ?? 0}{" "}
            assuntos, {parseStats.subtopics ?? 0} subtópicos (
            {parseStats.rows_imported ?? 0} linhas
            {(parseStats.rows_ignored ?? 0) > 0 &&
              `, ${parseStats.rows_ignored} ignoradas`}
            ).
          </p>
        )}
        <p>
          Envie o Excel de incidência e resolva questões nas matérias para ver
          priorização de <strong>{examName}</strong>.
        </p>
        <button
          type="button"
          onClick={() => load(true)}
          className="mt-3 text-violet-700 font-medium hover:underline"
        >
          Recalcular fila
        </button>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      {board.merge_warnings?.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Vários blocos Excel → mesma matéria</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {board.merge_warnings.map((w) => (
              <li key={w.subject_name}>
                <strong>{w.subject_name}</strong>: blocos somados —{" "}
                {w.excel_labels.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parseStats && (
        <p className="text-xs text-slate-500">
          Incidência: {parseStats.subjects ?? 0} matérias, {parseStats.topics ?? 0}{" "}
          assuntos, {parseStats.subtopics ?? 0} subtópicos (
          {parseStats.rows_imported ?? 0} linhas no banco).
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Priorização estratégica
          </h3>
          <p className="text-sm text-slate-600">
            Matérias ordenadas por urgência (fila × incidência × gap). Expanda
            cada matéria para ver assuntos, subtópicos e % de incidência histórica.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Atualizar fila
        </button>
      </div>

      <div className="space-y-3">
        {board.subjects.map((sub) => {
          const open = openSubjects.has(sub.subject_id)
          return (
            <div
              key={sub.subject_id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <button
                type="button"
                onClick={() => toggleSubject(sub.subject_id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
                  {sub.subject_rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{sub.subject_name}</p>
                  {(sub.excel_labels?.length > 1 || (sub.excel_label && sub.excel_label !== sub.subject_name)) && (
                    <p className="text-xs text-slate-500">
                      Excel:{" "}
                      {sub.excel_labels?.length > 1
                        ? sub.excel_labels.join(" + ")
                        : sub.excel_label}
                    </p>
                  )}
                </div>
                <span className="rounded-lg bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800">
                  score médio {sub.avg_priority_score.toFixed(2)}
                </span>
                {open ? (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                )}
              </button>

              {open && (
                <div className="border-t border-slate-100 px-4 pb-4">
                  <div className="mb-2 flex justify-end">
                    <Link
                      href={`/coach/materias/${sub.subject_id}/insights`}
                      className="text-xs font-medium text-violet-700 hover:underline"
                    >
                      Ver fila e insights desta matéria →
                    </Link>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Assunto</th>
                          <th className="px-3 py-2">Incidência</th>
                          <th className="px-3 py-2">Prioridade</th>
                          <th className="px-3 py-2">Gap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sub.topics.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-3 py-4 text-center text-slate-500"
                            >
                              Sem assuntos mapeados ainda.
                            </td>
                          </tr>
                        ) : (
                          sub.topics.map((t, i) => (
                            <tr
                              key={t.topic_key}
                              className={`border-t border-slate-50 ${
                                t.in_queue ? "" : "opacity-60"
                              }`}
                            >
                              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                              <td className="px-3 py-2 font-medium text-slate-800">
                                {t.hierarchy_code && (
                                  <span className="mr-1 font-mono text-xs text-slate-400">
                                    {t.hierarchy_code}
                                  </span>
                                )}
                                {t.topic_key}
                                {t.is_subtopic && (
                                  <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
                                    subtópico
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {t.incidence_percent != null ? (
                                  <span className="text-emerald-700">
                                    {t.incidence_percent.toFixed(1)}%
                                    {t.incidence_quantity != null && (
                                      <span className="text-slate-400">
                                        {" "}
                                        ({t.incidence_quantity} quest.)
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {t.priority_score != null ? (
                                  <span className="font-semibold text-violet-700">
                                    {t.priority_score.toFixed(2)}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {t.gap_score != null
                                  ? t.gap_score.toFixed(2)
                                  : "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
