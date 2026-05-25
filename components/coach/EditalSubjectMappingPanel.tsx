"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Link2 } from "lucide-react"

type RankRow = {
  id: string
  subject_name: string
  priority: number
  incidence_subject_label?: string | null
  subject_id?: string | null
}

type SubjectOption = { id: string; name: string }

export default function EditalSubjectMappingPanel({
  userId,
  examTargetId,
  reloadKey = 0,
}: {
  userId: string
  examTargetId: string
  reloadKey?: number
}) {
  const [rows, setRows] = useState<RankRow[]>([])
  const [incidenceLabels, setIncidenceLabels] = useState<string[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    return fetch(
      `/api/coach/exam-targets/${examTargetId}/edital-subject-rank?user_id=${userId}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setRows([])
          return
        }
        setRows(d.rows ?? [])
        setIncidenceLabels(d.incidence_labels ?? [])
        setSubjects(d.subjects ?? [])
      })
      .finally(() => setLoading(false))
  }, [userId, examTargetId])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  async function saveMapping(
    rankId: string,
    patch: { incidence_subject_label?: string | null; subject_id?: string | null }
  ) {
    setSavingId(rankId)
    try {
      const res = await fetch(
        `/api/coach/exam-targets/${examTargetId}/edital-subject-rank`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, rank_id: rankId, ...patch }),
        }
      )
      const data = await res.json()
      if (data.error) alert(data.error)
      else await load()
    } catch {
      alert("Falha ao salvar vínculo.")
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando vínculos…
      </div>
    )
  }

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-600">
        Após analisar o edital, configure aqui o pareamento: matéria do edital → matéria
        do Excel de incidência → sua matéria no app. Isso evita confusão quando você
        registrar erros em questões.
      </p>
    )
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-5 w-5 text-slate-600" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Pareamento de matérias
          </h4>
          <p className="text-xs text-slate-600">
            Confirme ou corrija os vínculos (a IA sugere a incidência; você valida). Usado
            depois para cruzar erros em questões com relevância do edital e da banca.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Edital</th>
              <th className="px-2 py-2">Incidência (Excel)</th>
              <th className="px-2 py-2">Minha matéria</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-2 py-2 font-medium text-violet-700">
                  {row.priority}
                </td>
                <td className="px-2 py-2 font-medium text-slate-900">
                  {row.subject_name}
                </td>
                <td className="px-2 py-2">
                  <select
                    className="w-full max-w-xs rounded border border-slate-300 px-2 py-1 text-xs"
                    value={row.incidence_subject_label ?? ""}
                    disabled={savingId === row.id}
                    onChange={(e) =>
                      saveMapping(row.id, {
                        incidence_subject_label: e.target.value || null,
                      })
                    }
                  >
                    <option value="">— sem vínculo —</option>
                    {incidenceLabels.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    className="w-full max-w-xs rounded border border-slate-300 px-2 py-1 text-xs"
                    value={row.subject_id ?? ""}
                    disabled={savingId === row.id}
                    onChange={(e) =>
                      saveMapping(row.id, {
                        subject_id: e.target.value || null,
                      })
                    }
                  >
                    <option value="">— sem vínculo —</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
