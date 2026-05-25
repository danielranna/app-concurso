"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Link2, Plus, X } from "lucide-react"

type RankRow = {
  id: string
  subject_name: string
  priority: number
  incidence_subject_labels: string[]
  subject_ids: string[]
}

type SubjectOption = { id: string; name: string }

function MultiLinkEditor({
  rowId,
  disabled,
  options,
  values,
  optionLabel,
  onSave,
}: {
  rowId: string
  disabled: boolean
  options: { value: string; label: string }[]
  values: string[]
  optionLabel: (value: string) => string
  onSave: (rowId: string, next: string[]) => void
}) {
  const [pick, setPick] = useState("")

  function add() {
    if (!pick || values.includes(pick)) return
    onSave(rowId, [...values, pick])
    setPick("")
  }

  function remove(value: string) {
    onSave(
      rowId,
      values.filter((v) => v !== value)
    )
  }

  const available = options.filter((o) => !values.includes(o.value))

  return (
    <div className="space-y-1.5">
      {values.map((v) => (
        <div
          key={v}
          className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
        >
          <span className="min-w-0 flex-1 truncate text-slate-800">
            {optionLabel(v)}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => remove(v)}
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
            aria-label="Remover vínculo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-1">
        <select
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
          value={pick}
          disabled={disabled || !available.length}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">
            {available.length ? "Escolher…" : "— todas adicionadas —"}
          </option>
          {available.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled || !pick}
          onClick={add}
          className="inline-flex shrink-0 items-center justify-center rounded border border-violet-300 bg-violet-50 px-2 py-1 text-violet-800 hover:bg-violet-100 disabled:opacity-40"
          title="Adicionar vínculo"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

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
        setRows(
          (d.rows ?? []).map(
            (r: RankRow & {
              incidence_subject_label?: string | null
              subject_id?: string | null
            }) => ({
              ...r,
              incidence_subject_labels:
                r.incidence_subject_labels ??
                (r.incidence_subject_label ? [r.incidence_subject_label] : []),
              subject_ids:
                r.subject_ids ?? (r.subject_id ? [r.subject_id] : []),
            })
          )
        )
        setIncidenceLabels(d.incidence_labels ?? [])
        setSubjects(d.subjects ?? [])
      })
      .finally(() => setLoading(false))
  }, [userId, examTargetId])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  async function saveIncidenceLabels(rankId: string, labels: string[]) {
    setSavingId(rankId)
    try {
      const res = await fetch(
        `/api/coach/exam-targets/${examTargetId}/edital-subject-rank`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            rank_id: rankId,
            incidence_subject_labels: labels,
          }),
        }
      )
      const data = await res.json()
      if (data.error) alert(data.error)
      else await load()
    } catch {
      alert("Falha ao salvar vínculo de incidência.")
    } finally {
      setSavingId(null)
    }
  }

  async function saveSubjectIds(rankId: string, ids: string[]) {
    setSavingId(rankId)
    try {
      const res = await fetch(
        `/api/coach/exam-targets/${examTargetId}/edital-subject-rank`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            rank_id: rankId,
            subject_ids: ids,
          }),
        }
      )
      const data = await res.json()
      if (data.error) alert(data.error)
      else await load()
    } catch {
      alert("Falha ao salvar vínculo da matéria.")
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
        Após analisar o edital, configure aqui o pareamento. Um item do edital pode
        ligar a <strong>várias</strong> matérias do Excel e do app (use +).
      </p>
    )
  }

  const subjectById = new Map(subjects.map((s) => [s.id, s.name]))

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-5 w-5 text-slate-600" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Pareamento de matérias
          </h4>
          <p className="text-xs text-slate-600">
            Quando o edital agrupa várias matérias (ex. Civil + Empresarial + Penal),
            use <strong>+</strong> para vincular cada uma no Excel e nas suas matérias.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-2 py-2 w-8">#</th>
              <th className="px-2 py-2 min-w-[180px]">Edital</th>
              <th className="px-2 py-2 min-w-[220px]">Incidência (Excel)</th>
              <th className="px-2 py-2 min-w-[220px]">Minha matéria</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="px-2 py-2 font-medium text-violet-700">
                  {row.priority}
                </td>
                <td className="px-2 py-2 font-medium text-slate-900">
                  {row.subject_name}
                </td>
                <td className="px-2 py-2">
                  <MultiLinkEditor
                    rowId={row.id}
                    disabled={savingId === row.id}
                    values={row.incidence_subject_labels}
                    options={incidenceLabels.map((l) => ({
                      value: l,
                      label: l,
                    }))}
                    optionLabel={(v) => v}
                    onSave={saveIncidenceLabels}
                  />
                </td>
                <td className="px-2 py-2">
                  <MultiLinkEditor
                    rowId={row.id}
                    disabled={savingId === row.id}
                    values={row.subject_ids}
                    options={subjects.map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))}
                    optionLabel={(id) => subjectById.get(id) ?? id}
                    onSave={saveSubjectIds}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
