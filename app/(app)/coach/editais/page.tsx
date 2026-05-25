"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import {
  FileUp,
  Loader2,
  Plus,
  Sparkles,
  Star,
} from "lucide-react"
import ExamPlanReportCard from "@/components/coach/ExamPlanReportCard"
import ExamStrategyBoardPanel from "@/components/coach/ExamStrategyBoard"
import EditalPrioritiesPanel from "@/components/coach/EditalPrioritiesPanel"
import type { ExamPlanStructured, ExamTarget } from "@/lib/coach-types"

type SubjectRow = { id: string; name: string }

type IncidenceGroup = {
  code: string
  name: string
  quantity: number
  percent: number
}

type BlockMapping = {
  excel_label: string
  subject_id: string | null
  subject_name: string | null
  match_score: number
  group_count: number
  manual?: boolean
}

type SubjectMapping = {
  subject_id: string
  subject_name: string
  excel_label: string
  match_score: number
}

type DocRow = {
  id: string
  title: string
  doc_type: string
  subject_id: string | null
  status: string
  created_at: string
  parsed_tables?: {
    char_count?: number
    format?: string
    scope?: string
    block_count?: number
    group_count?: number
    groups?: IncidenceGroup[]
    matched_subject_label?: string
    parse_stats?: {
      subjects?: number
      topics?: number
      subtopics?: number
      subject_count?: number
      topic_count?: number
      subtopic_count?: number
      rows_imported?: number
      rows_inserted_db?: number
      rows_ignored?: number
      ignored_count?: number
      persist_error?: string | null
      ignored_samples?: string[]
    }
    flat_row_count?: number
    merge_warnings?: {
      subject_id: string
      subject_name: string
      excel_labels: string[]
    }[]
    subject_mappings?: {
      by_block?: BlockMapping[]
      by_subject?: SubjectMapping[]
      unmapped_subjects?: { id: string; name: string }[]
    }
  }
}

type PlanReport = {
  id: string
  summary_md: string | null
  structured: ExamPlanStructured
  created_at: string
}

function incidenceStatsLine(
  pt: DocRow["parsed_tables"] | undefined
): string | null {
  if (!pt?.parse_stats && pt?.flat_row_count == null) return null
  const s = pt?.parse_stats ?? {}
  const rows =
    s.rows_inserted_db ??
    s.rows_imported ??
    s.topic_count ??
    pt?.flat_row_count ??
    0
  const subtopics = s.subtopics ?? s.subtopic_count ?? 0
  const ignored = s.rows_ignored ?? s.ignored_count ?? 0
  return `${rows} linhas no banco · ${subtopics} subtópicos${ignored > 0 ? ` · ${ignored} ignoradas` : ""}`
}

export default function CoachEditaisPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [targets, setTargets] = useState<ExamTarget[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [reports, setReports] = useState<PlanReport[]>([])
  const [name, setName] = useState("")
  const [banca, setBanca] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [savingMapping, setSavingMapping] = useState<string | null>(null)
  const active = targets.find((t) => t.id === selectedId) ?? targets.find((t) => t.is_active)

  function reloadTargets(uid: string) {
    return fetch(`/api/coach/exam-targets?user_id=${uid}`)
      .then((r) => r.json())
      .then((list: ExamTarget[]) => {
        setTargets(list ?? [])
        const act = list.find((t) => t.is_active) ?? list[0]
        if (act && (!selectedId || !list.some((t) => t.id === selectedId))) {
          setSelectedId(act.id)
        }
        return list
      })
  }

  function reloadDocs(uid: string, examId: string) {
    fetch(`/api/coach/documents?user_id=${uid}&exam_target_id=${examId}`)
      .then((r) => r.json())
      .then(setDocs)
    fetch(`/api/coach/exam-targets/${examId}/reports?user_id=${uid}`)
      .then((r) => r.json())
      .then(setReports)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reloadTargets(user.id)
      fetch(`/api/subjects?user_id=${user.id}`)
        .then((r) => r.json())
        .then((s) => setSubjects(s ?? []))
    })
  }, [router])

  useEffect(() => {
    if (userId && selectedId) reloadDocs(userId, selectedId)
  }, [userId, selectedId])

  async function createTarget() {
    if (!userId || !name.trim()) return
    setSaving(true)
    const res = await fetch("/api/coach/exam-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: name.trim(),
        banca: banca.trim() || null,
        set_active: targets.length === 0,
      }),
    })
    const data = await res.json()
    setSaving(false)
    setName("")
    setBanca("")
    reloadTargets(userId)
    if (data.id) setSelectedId(data.id)
  }

  async function setActive(id: string) {
    if (!userId) return
    await fetch(`/api/coach/exam-targets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, set_active: true }),
    })
    setSelectedId(id)
    reloadTargets(userId)
  }

  async function uploadDoc(docType: "edital" | "incidence", file: File) {
    if (!userId || !selectedId) {
      alert("Selecione uma prova na lista acima.")
      return
    }
    setUploading(docType)
    const form = new FormData()
    form.set("user_id", userId)
    form.set("doc_type", docType)
    form.set("file", file)
    form.set("exam_target_id", selectedId)
    form.set("title", file.name)

    try {
      const res = await fetch("/api/coach/documents/upload", {
        method: "POST",
        body: form,
      })
      const data = await res.json()
      if (data.error) {
        alert(data.error)
      } else {
        reloadDocs(userId, selectedId)
        if (docType === "incidence") {
          const stats = data.parsed_tables?.parse_stats
          const n = data.parsed_tables?.block_count ?? 0
          const mapped =
            data.parsed_tables?.subject_mappings?.by_subject?.length ?? 0
          const rows =
            stats?.rows_inserted_db ??
            stats?.rows_imported ??
            stats?.topic_count ??
            data.parsed_tables?.flat_row_count ??
            0
          const msg = stats
            ? `Importadas: ${stats.subjects ?? stats.subject_count ?? 0} matérias, ${stats.topics ?? stats.topic_count ?? 0} assuntos, ${stats.subtopics ?? stats.subtopic_count ?? 0} subtópicos (${rows} linhas no banco${(stats.rows_ignored ?? stats.ignored_count ?? 0) > 0 ? `, ${stats.rows_ignored ?? stats.ignored_count} ignoradas` : ""}). ${mapped} matérias vinculadas.`
            : `Excel importado: ${n} blocos. ${mapped} matérias vinculadas.`
          if (stats?.persist_error) {
            alert(`${msg}\n\nErro no banco: ${stats.persist_error}`)
          } else {
            alert(msg)
          }
        }
      }
    } catch {
      alert("Falha no envio. Verifique o bucket coach-documents no Supabase.")
    } finally {
      setUploading(null)
    }
  }

  async function updateIncidenceMapping(
    excelLabel: string,
    subjectId: string | null
  ) {
    if (!userId || !incidenceWorkbook) return
    setSavingMapping(excelLabel)
    try {
      const res = await fetch(
        `/api/coach/documents/${incidenceWorkbook.id}/incidence-mapping`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            excel_label: excelLabel,
            subject_id: subjectId,
          }),
        }
      )
      const data = await res.json()
      if (data.error) alert(data.error)
      else if (selectedId) reloadDocs(userId, selectedId)
    } catch {
      alert("Não foi possível salvar o vínculo.")
    } finally {
      setSavingMapping(null)
    }
  }

  async function generatePlan() {
    if (!userId || !selectedId) return
    setPlanning(true)
    const res = await fetch(`/api/coach/exam-targets/${selectedId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
    const data = await res.json()
    setPlanning(false)
    if (data.error) alert(data.error)
    else {
      reloadDocs(userId, selectedId)
      alert(
        "Plano gerado! Veja abaixo e confira ações sugeridas em Ações pendentes."
      )
    }
  }

  const editalDoc = docs.find((d) => d.doc_type === "edital")
  const incidenceWorkbook = docs.find(
    (d) =>
      d.doc_type === "incidence" &&
      !d.subject_id &&
      d.parsed_tables?.scope === "exam_workbook"
  )
  const legacyIncidenceDocs = docs.filter(
    (d) => d.doc_type === "incidence" && d.subject_id
  )
  const mappings = incidenceWorkbook?.parsed_tables?.subject_mappings

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Cadastre a prova, envie o PDF do edital e um único Excel de incidência
        (todas as matérias no mesmo arquivo). O coach distribui automaticamente
        para cada matéria sua.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Nova prova alvo
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex. TRT 2026)"
            className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={banca}
            onChange={(e) => setBanca(e.target.value)}
            placeholder="Banca (opcional)"
            className="min-w-[140px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={createTarget}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Adicionar
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {targets.map((t) => (
          <li
            key={t.id}
            className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition ${
              selectedId === t.id
                ? "border-violet-400 bg-violet-50"
                : t.is_active
                  ? "border-emerald-300 bg-emerald-50/50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
            onClick={() => setSelectedId(t.id)}
          >
            <div>
              <p className="font-medium text-slate-900">{t.name}</p>
              {t.banca && (
                <p className="text-xs text-slate-500">{t.banca}</p>
              )}
            </div>
            {t.is_active ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
                <Star className="h-3 w-3 fill-current" />
                Ativa
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setActive(t.id)
                }}
                className="text-xs font-medium text-violet-700 hover:underline"
              >
                Definir ativa
              </button>
            )}
          </li>
        ))}
      </ul>

      {!targets.length && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Crie uma prova alvo acima para liberar o envio de edital e incidência.
        </p>
      )}

      {active ? (
        <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/30 p-4">
          <h3 className="font-semibold text-slate-900">
            Documentos — {active.name}
          </h3>
          <p className="text-xs text-slate-600">
            Edital = PDF. Incidência = Excel (.xlsx) com códigos 01, 02 e
            subtópicos 02.01, 03.02 (alinhados aos tec_topic dos cadernos).
            Limites diários e fase da prova em{" "}
            <a href="/coach/configuracoes" className="text-violet-700 hover:underline">
              Configurações
            </a>
            .
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <FileUp className="h-4 w-4" />
              {uploading === "edital" ? "Enviando…" : "Enviar PDF do edital"}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadDoc("edital", f)
                  e.target.value = ""
                }}
              />
            </label>
            {editalDoc && (
              <span className="text-xs font-medium text-emerald-700">
                ✓ {editalDoc.title} (
                {editalDoc.parsed_tables?.char_count ?? 0} caracteres)
              </span>
            )}
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">
              Incidência — um Excel para toda a prova
            </p>
            <p className="text-xs text-slate-600">
              O mesmo arquivo que você já tem (várias disciplinas em abas ou
              blocos). Não precisa separar por matéria.
            </p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <FileUp className="h-4 w-4" />
              {uploading === "incidence"
                ? "Enviando…"
                : incidenceWorkbook
                  ? "Substituir Excel de incidência"
                  : "Enviar Excel completo"}
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="sr-only"
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadDoc("incidence", f)
                  e.target.value = ""
                }}
              />
            </label>
            {incidenceWorkbook && (
              <div className="text-xs font-medium text-emerald-700 space-y-1">
                <p>
                  ✓ {incidenceWorkbook.title} —{" "}
                  {incidenceWorkbook.parsed_tables?.block_count ?? 0} blocos,{" "}
                  {mappings?.by_subject?.length ?? 0} matérias vinculadas
                </p>
                {incidenceStatsLine(incidenceWorkbook.parsed_tables) && (
                  <p className="text-slate-600 font-normal">
                    {incidenceStatsLine(incidenceWorkbook.parsed_tables)}
                  </p>
                )}
                {incidenceWorkbook.parsed_tables?.parse_stats?.persist_error && (
                  <p className="text-amber-800 font-normal">
                    Erro ao gravar no banco:{" "}
                    {incidenceWorkbook.parsed_tables.parse_stats.persist_error}
                    {" "}
                    (execute sql-incidence-rows.sql no Supabase e envie de novo)
                  </p>
                )}
              </div>
            )}
          </div>

          {(incidenceWorkbook?.parsed_tables?.merge_warnings?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">Blocos somados na mesma matéria</p>
              <ul className="mt-1 list-inside list-disc">
                {incidenceWorkbook!.parsed_tables!.merge_warnings!.map((w) => (
                  <li key={w.subject_id}>
                    <strong>{w.subject_name}</strong>: {w.excel_labels.length} blocos
                    ({w.excel_labels.join(", ")}) — assuntos serão unidos.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mappings?.by_block && mappings.by_block.length > 0 && (
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <p className="text-sm font-medium text-slate-800">
                Vínculo Excel → suas matérias
              </p>
              <p className="text-xs text-slate-600">
                Ajuste no menu da coluna &quot;Sua matéria&quot; quando o
                automático errar. Vários blocos na mesma matéria são somados.
              </p>
              <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left text-slate-500">
                      <th className="px-3 py-2">No Excel</th>
                      <th className="min-w-[200px] px-3 py-2">Sua matéria</th>
                      <th className="px-3 py-2">Agrup.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.by_block.map((row) => (
                      <tr
                        key={row.excel_label}
                        className={`border-t border-slate-100 ${
                          row.subject_id ? "" : "bg-amber-50/80"
                        }`}
                      >
                        <td className="px-3 py-1.5 align-top">
                          <span className="line-clamp-2">{row.excel_label}</span>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <select
                              value={row.subject_id ?? ""}
                              disabled={
                                savingMapping === row.excel_label || !subjects.length
                              }
                              onChange={(e) => {
                                const v = e.target.value
                                updateIncidenceMapping(
                                  row.excel_label,
                                  v === "" ? null : v
                                )
                              }}
                              className="max-w-full min-w-[160px] flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                            >
                              <option value="">— sem vínculo —</option>
                              {subjects.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                            {savingMapping === row.excel_label && (
                              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-slate-400" />
                            )}
                            {row.manual && (
                              <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
                                editado
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 align-top">{row.group_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(mappings.unmapped_subjects?.length ?? 0) > 0 && (
                <p className="text-xs text-amber-800">
                  Matérias suas sem bloco no Excel:{" "}
                  {mappings.unmapped_subjects!.map((s) => s.name).join(", ")}
                </p>
              )}
            </div>
          )}

          {legacyIncidenceDocs.length > 0 && !incidenceWorkbook && (
            <p className="text-xs text-slate-500 border-t border-slate-200 pt-2">
              Você ainda tem {legacyIncidenceDocs.length} Excel(s) antigos por
              matéria — envie o arquivo completo acima para unificar.
            </p>
          )}

          <button
            type="button"
            onClick={generatePlan}
            disabled={planning || !editalDoc}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {planning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Gerar plano da prova (coach edital)
          </button>
          {!editalDoc && (
            <p className="text-xs text-amber-700">
              Envie o PDF do edital antes de gerar o plano.
            </p>
          )}
        </div>
      ) : (
        targets.length > 0 && (
          <p className="text-sm text-slate-500">
            Clique em uma prova na lista para enviar documentos.
          </p>
        )
      )}

      {active && userId && (
        <>
          <EditalPrioritiesPanel
            userId={userId}
            examTargetId={active.id}
            examName={active.name}
            hasEdital={!!editalDoc}
            hasIncidence={!!incidenceWorkbook}
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 md:p-6">
            <ExamStrategyBoardPanel
              userId={userId}
              examTargetId={active.id}
              examName={active.name}
            />
          </div>
        </>
      )}

      {reports.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Planos gerados
          </h3>
          <ul className="space-y-3">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <ExamPlanReportCard
                  createdAt={r.created_at}
                  structured={r.structured ?? {}}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
