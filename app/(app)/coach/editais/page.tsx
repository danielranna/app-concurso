"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { FileUp, Loader2, Plus, Sparkles, Star } from "lucide-react"
import ExamPlanReportCard from "@/components/coach/ExamPlanReportCard"
import ExamStrategyBoardPanel from "@/components/coach/ExamStrategyBoard"
import EditalPrioritiesPanel from "@/components/coach/EditalPrioritiesPanel"
import StrategicExamDashboard from "@/components/coach/StrategicExamDashboard"
import type { ExamPlanStructured, ExamTarget } from "@/lib/coach-types"

type SubjectRow = { id: string; name: string }

type SlugMapping = {
  slug: string
  md_name: string
  subject_ids?: string[]
  subject_names?: string[]
  subject_id: string | null
  subject_name: string | null
  match_score: number
  topic_count: number
  manual?: boolean
}

type DocRow = {
  id: string
  title: string
  doc_type: string
  subject_id: string | null
  status: string
  created_at: string
  parsed_tables?: {
    parse_stats?: {
      subjects?: number
      topics?: number
      rows_inserted_db?: number
      warnings?: string[]
    }
    subject_mappings?: {
      by_slug?: SlugMapping[]
      merge_warnings?: { subject_id: string; subject_name: string; slugs: string[] }[]
    }
  }
}

type PlanReport = {
  id: string
  summary_md: string | null
  structured: ExamPlanStructured
  created_at: string
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
  const [uploading, setUploading] = useState(false)
  const [reprocessing, setReprocessing] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [savingMapping, setSavingMapping] = useState<string | null>(null)
  const [dashboardKey, setDashboardKey] = useState(0)
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

  async function uploadStrategicMd(file: File) {
    if (!userId || !selectedId) {
      alert("Selecione uma prova na lista acima.")
      return
    }
    setUploading(true)
    const form = new FormData()
    form.set("user_id", userId)
    form.set("exam_target_id", selectedId)
    form.set("file", file)
    form.set("title", file.name)

    try {
      const res = await fetch("/api/coach/strategic-md/upload", {
        method: "POST",
        body: form,
      })
      const data = await res.json()
      if (data.error) {
        alert(data.error)
      } else {
        const stats = data.parse_stats ?? {}
        const mapped = data.subject_mappings?.by_slug?.filter(
          (r: SlugMapping) => (r.subject_ids?.length ?? (r.subject_id ? 1 : 0)) > 0
        ).length
        alert(
          `MD importado: ${stats.subjects ?? 0} matérias, ${stats.topics ?? 0} tópicos, ${stats.rows_inserted_db ?? 0} linhas no banco. ${mapped ?? 0} matérias vinculadas automaticamente.`
        )
        reloadDocs(userId, selectedId)
        setDashboardKey((k) => k + 1)
      }
    } catch {
      alert("Falha no envio do MD.")
    } finally {
      setUploading(false)
    }
  }

  async function updateSlugMapping(slug: string, subjectIds: string[]) {
    if (!userId || !strategicDoc) return
    setSavingMapping(slug)
    try {
      const res = await fetch(
        `/api/coach/documents/${strategicDoc.id}/strategic-mapping`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            slug,
            subject_ids: subjectIds,
          }),
        }
      )
      const data = await res.json()
      if (data.error) alert(data.error)
      else if (selectedId) {
        reloadDocs(userId, selectedId)
        setDashboardKey((k) => k + 1)
      }
    } catch {
      alert("Não foi possível salvar o vínculo.")
    } finally {
      setSavingMapping(null)
    }
  }

  async function enrichWithAi() {
    if (!userId || !selectedId) return
    setEnriching(true)
    try {
      const res = await fetch(
        `/api/coach/exam-targets/${selectedId}/enrich-strategic`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        }
      )
      const data = await res.json()
      if (data.error) alert(data.error)
      else {
        alert(`Enriquecimento concluído (${data.model_used ?? "IA"}).`)
        setDashboardKey((k) => k + 1)
      }
    } catch {
      alert("Falha no enriquecimento com IA.")
    } finally {
      setEnriching(false)
    }
  }

  async function reparseTopics() {
    if (!userId || !selectedId || !strategicDoc) return
    setReprocessing(true)
    try {
      const res = await fetch(
        `/api/coach/documents/${strategicDoc.id}/reparse-strategic`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            exam_target_id: selectedId,
          }),
        }
      )
      const data = await res.json()
      if (data.error) alert(data.error)
      else {
        alert(
          `Tópicos atualizados: ${data.topic_total ?? 0} linhas no banco.`
        )
        reloadDocs(userId, selectedId)
        setDashboardKey((k) => k + 1)
      }
    } catch {
      alert("Falha ao reprocessar o MD.")
    } finally {
      setReprocessing(false)
    }
  }

  function toggleExtraSubject(slug: string, row: SlugMapping, subjectId: string) {
    const current = row.subject_ids ?? (row.subject_id ? [row.subject_id] : [])
    const next = current.includes(subjectId)
      ? current.filter((id) => id !== subjectId)
      : [...current, subjectId]
    updateSlugMapping(slug, next)
  }

  function setPrimarySubject(slug: string, subjectId: string | null) {
    const row = slugMappings?.by_slug?.find((r) => r.slug === slug)
    const current = row?.subject_ids ?? (row?.subject_id ? [row.subject_id] : [])
    if (!subjectId) {
      updateSlugMapping(slug, [])
      return
    }
    const rest = current.filter((id) => id !== subjectId)
    updateSlugMapping(slug, [subjectId, ...rest])
  }

  const strategicDoc = docs.find((d) => d.doc_type === "strategic_md")
  const slugMappings = strategicDoc?.parsed_tables?.subject_mappings

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Cadastre a prova e importe o arquivo <strong>.md</strong> de análise
        estratégica (template com metadados, ranking, incidência e prioridades).
        Limites e fase em{" "}
        <a href="/coach/configuracoes" className="text-violet-700 hover:underline">
          Configurações
        </a>
        .
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Nova prova alvo</h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex. SEEC Auditor 2019)"
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
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
              {t.banca && <p className="text-xs text-slate-500">{t.banca}</p>}
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
          Crie uma prova alvo acima para importar a análise estratégica.
        </p>
      )}

      {active ? (
        <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/30 p-4">
          <h3 className="font-semibold text-slate-900">Análise estratégica — {active.name}</h3>
          <p className="text-xs text-slate-600">
            Importe o <code className="rounded bg-white px-1">analise_estrategica_*.md</code> com
            edital, incidência e prioridades. O plano de estudo diário fica em Coach → Hoje (outros
            agentes).
          </p>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <FileUp className="h-4 w-4" />
            {uploading
              ? "Importando…"
              : strategicDoc
                ? "Substituir análise (.md)"
                : "Importar análise estratégica (.md)"}
            <input
              type="file"
              accept=".md,.markdown,text/markdown"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadStrategicMd(f)
                e.target.value = ""
              }}
            />
          </label>

          {strategicDoc && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-medium text-emerald-700 space-y-1">
                <p>✓ {strategicDoc.title}</p>
                <p className="font-normal text-slate-600">
                  {strategicDoc.parsed_tables?.parse_stats?.subjects ?? 0} matérias ·{" "}
                  {strategicDoc.parsed_tables?.parse_stats?.topics ?? 0} tópicos ·{" "}
                  {strategicDoc.parsed_tables?.parse_stats?.rows_inserted_db ?? 0} linhas no banco
                </p>
              </div>
              <button
                type="button"
                onClick={reparseTopics}
                disabled={reprocessing}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {reprocessing ? "Atualizando…" : "Atualizar tópicos do MD"}
              </button>
            </div>
          )}

          {(slugMappings?.merge_warnings?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">Vários slugs → mesma matéria sua</p>
              <ul className="mt-1 list-inside list-disc">
                {slugMappings!.merge_warnings!.map((w) => (
                  <li key={w.subject_id}>
                    <strong>{w.subject_name}</strong>: {w.slugs.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {slugMappings?.by_slug && slugMappings.by_slug.length > 0 && (
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <p className="text-sm font-medium text-slate-800">Vínculo MD → suas matérias</p>
              <p className="text-xs text-slate-600">
                Uma matéria do MD pode ir para <strong>várias</strong> matérias suas (ex. Contabilidade
                Pública + Contabilidade Geral → Contabilidade). Marque as extras abaixo do select.
              </p>
              <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left text-slate-500">
                      <th className="px-3 py-2">No MD</th>
                      <th className="px-3 py-2">slug</th>
                      <th className="min-w-[220px] px-3 py-2">Suas matérias</th>
                      <th className="px-3 py-2">Tópicos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slugMappings.by_slug.map((row) => {
                      const linked =
                        row.subject_ids ?? (row.subject_id ? [row.subject_id] : [])
                      const primary = linked[0] ?? ""
                      return (
                        <tr
                          key={row.slug}
                          className={`border-t border-slate-100 ${
                            linked.length ? "" : "bg-amber-50/80"
                          }`}
                        >
                          <td className="px-3 py-1.5 align-top">
                            <span className="line-clamp-2">{row.md_name}</span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                            {row.slug}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1">
                                <select
                                  value={primary}
                                  disabled={savingMapping === row.slug || !subjects.length}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setPrimarySubject(row.slug, v === "" ? null : v)
                                  }}
                                  className="max-w-full min-w-[160px] flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                >
                                  <option value="">— sem vínculo —</option>
                                  {subjects.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                                {savingMapping === row.slug && (
                                  <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                                )}
                              </div>
                              {linked.length > 1 && (
                                <p className="text-[10px] text-violet-700">
                                  Também em: {row.subject_names?.slice(1).join(", ")}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-2 pt-0.5">
                                {subjects
                                  .filter((s) => s.id !== primary)
                                  .map((s) => (
                                    <label
                                      key={s.id}
                                      className="inline-flex items-center gap-1 text-[10px] text-slate-600"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={linked.includes(s.id)}
                                        disabled={savingMapping === row.slug}
                                        onChange={() =>
                                          toggleExtraSubject(row.slug, row, s.id)
                                        }
                                      />
                                      + {s.name}
                                    </label>
                                  ))}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 align-top">
                            {row.topic_count > 0 ? (
                              <span className="text-emerald-700">{row.topic_count}</span>
                            ) : (
                              <span className="text-slate-400" title="Sem tabela no MD">
                                0
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      ) : (
        targets.length > 0 && (
          <p className="text-sm text-slate-500">Clique em uma prova para importar o MD.</p>
        )
      )}

      {active && userId && strategicDoc && (
        <>
          <StrategicExamDashboard
            key={dashboardKey}
            userId={userId}
            examTargetId={active.id}
            onEnrich={enrichWithAi}
            enriching={enriching}
          />
          <EditalPrioritiesPanel
            userId={userId}
            examTargetId={active.id}
            examName={active.name}
            hasStrategicMd={!!strategicDoc}
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
            Relatórios antigos (legado)
          </h3>
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
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
