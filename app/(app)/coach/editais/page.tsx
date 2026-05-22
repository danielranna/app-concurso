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
import type { ExamTarget } from "@/lib/coach-types"

type SubjectRow = { id: string; name: string }

type IncidenceGroup = {
  code: string
  name: string
  quantity: number
  percent: number
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
    group_count?: number
    groups?: IncidenceGroup[]
    matched_subject_label?: string
  }
}

type PlanReport = {
  id: string
  summary_md: string | null
  structured: { headline?: string; exam_readiness_score?: number }
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
  const [uploading, setUploading] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [incidenceSubjectId, setIncidenceSubjectId] = useState("")

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
        .then((s) => {
          setSubjects(s ?? [])
          if (s?.[0]) setIncidenceSubjectId(s[0].id)
        })
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

  async function uploadDoc(
    docType: "edital" | "incidence",
    file: File,
    subjectId?: string
  ) {
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
    if (subjectId) form.set("subject_id", subjectId)
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
        if (docType === "incidence" && data.parsed_tables?.group_count != null) {
          alert(
            `Incidência importada: ${data.parsed_tables.group_count} agrupamentos (sem subtópicos).`
          )
        }
      }
    } catch {
      alert("Falha no envio. Verifique o bucket coach-documents no Supabase.")
    } finally {
      setUploading(null)
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
  const incidenceDocs = docs.filter((d) => d.doc_type === "incidence")

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Cadastre a prova, envie o PDF do edital e um PDF de incidência por
        matéria. O coach cruza com seu desempenho e gera o plano.
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
            Edital = PDF. Incidência = Excel (.xlsx) com agrupamentos (códigos
            01, 02, 03…); subtópicos (02.01, etc.) são ignorados de propósito.
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
              Incidência por matéria (Excel)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={incidenceSubjectId}
                onChange={(e) => setIncidenceSubjectId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {!subjects.length && (
                  <option value="">Cadastre matérias em Configurações</option>
                )}
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <FileUp className="h-4 w-4" />
                {uploading === "incidence"
                  ? "Enviando…"
                  : "Enviar Excel de incidência"}
                <input
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="sr-only"
                  disabled={!!uploading || !incidenceSubjectId}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadDoc("incidence", f, incidenceSubjectId)
                    e.target.value = ""
                  }}
                />
              </label>
            </div>
          </div>

          {incidenceDocs.length > 0 && (
            <div className="space-y-3 border-t border-slate-200 pt-4">
              {incidenceDocs.map((d) => {
                const sub = subjects.find((s) => s.id === d.subject_id)
                const groups = d.parsed_tables?.groups ?? []
                return (
                  <div
                    key={d.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                  >
                    <p className="font-medium text-slate-900">
                      {sub?.name ?? "Matéria"} — {d.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {groups.length} agrupamentos
                      {d.parsed_tables?.matched_subject_label &&
                        ` · bloco “${d.parsed_tables.matched_subject_label}”`}
                    </p>
                    {groups.length > 0 && (
                      <table className="mt-2 w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="py-1">Assunto</th>
                            <th>Qtd</th>
                            <th>%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...groups]
                            .sort((a, b) => b.percent - a.percent)
                            .slice(0, 12)
                            .map((g) => (
                              <tr key={g.code} className="border-t border-slate-100">
                                <td className="py-1 pr-2">{g.name}</td>
                                <td>{g.quantity}</td>
                                <td>{g.percent.toFixed(1)}%</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })}
            </div>
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

      {reports.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Planos gerados
          </h3>
          <ul className="space-y-3">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
              >
                <p className="font-medium text-slate-900">
                  {r.structured?.headline ?? "Plano"}
                  {r.structured?.exam_readiness_score != null && (
                    <span className="ml-2 text-violet-700">
                      Prontidão: {r.structured.exam_readiness_score}%
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </p>
                {r.summary_md && (
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
                    {r.summary_md.slice(0, 2000)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
