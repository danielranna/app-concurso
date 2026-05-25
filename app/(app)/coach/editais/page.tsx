"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { FileUp, Loader2, Plus, Star } from "lucide-react"
import IncidenceHierarchyPanel from "@/components/coach/IncidenceHierarchyPanel"
import EditalPrioritiesPanel from "@/components/coach/EditalPrioritiesPanel"
import EditalSubjectMappingPanel from "@/components/coach/EditalSubjectMappingPanel"
import type { ExamTarget } from "@/lib/coach-types"

type IncidenceDocRow = {
  id: string
  title: string
  subject_id?: string | null
  parsed_tables?: {
    scope?: string
    parse_stats?: {
      subjects?: number
      rows_inserted_db?: number
      subjects_percent_ok?: number
    }
  }
}

export default function CoachEditaisPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [targets, setTargets] = useState<ExamTarget[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [incidenceDoc, setIncidenceDoc] = useState<IncidenceDocRow | null>(null)
  const [name, setName] = useState("")
  const [banca, setBanca] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploadingExcel, setUploadingExcel] = useState(false)
  const [hierarchyKey, setHierarchyKey] = useState(0)
  const [mappingKey, setMappingKey] = useState(0)

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

  function reloadIncidenceDoc(uid: string, examId: string) {
    return fetch(`/api/coach/documents?user_id=${uid}&exam_target_id=${examId}&doc_type=incidence`)
      .then((r) => r.json())
      .then((docs: IncidenceDocRow[]) => {
        const wb = (docs ?? []).find(
          (d) =>
            !d.subject_id &&
            d.parsed_tables?.scope === "exam_workbook"
        )
        setIncidenceDoc(wb ?? null)
      })
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reloadTargets(user.id)
    })
  }, [router])

  useEffect(() => {
    if (userId && selectedId) reloadIncidenceDoc(userId, selectedId)
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

  async function uploadIncidenceExcel(file: File) {
    if (!userId || !selectedId) {
      alert("Selecione uma prova na lista acima.")
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      alert("Arquivo muito grande (máx. 15 MB). Salve uma cópia mais leve no Excel.")
      return
    }

    setUploadingExcel(true)
    const form = new FormData()
    form.set("user_id", userId)
    form.set("exam_target_id", selectedId)
    form.set("doc_type", "incidence")
    form.set("file", file)
    form.set("title", file.name)

    try {
      const res = await fetch("/api/coach/documents/upload", { method: "POST", body: form })
      let data: {
        error?: string
        parsed_tables?: {
          parse_stats?: {
            subjects?: number
            topics?: number
            subtopics?: number
            rows_imported?: number
            persist_error?: string | null
            subjects_percent_ok?: number
          }
        }
      }
      try {
        data = await res.json()
      } catch {
        alert(`Resposta inválida do servidor (${res.status}).`)
        return
      }
      if (!res.ok || data.error) {
        alert(data.error ?? `Erro no servidor (${res.status})`)
      } else {
        const stats = data.parsed_tables?.parse_stats ?? {}
        const warn = stats.persist_error ? `\n\nAviso: ${stats.persist_error}` : ""
        alert(
          `Importado: ${stats.subjects ?? 0} matérias, ${stats.topics ?? 0} linhas, ${stats.subjects_percent_ok ?? 0} com Σ%≈100%.${warn}`
        )
        reloadIncidenceDoc(userId, selectedId)
        setHierarchyKey((k) => k + 1)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro de rede"
      alert(`Falha no envio: ${msg}`)
    } finally {
      setUploadingExcel(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Editais e incidência</h2>
        <p className="mt-1 text-sm text-slate-600">
          Cadastre a prova alvo, importe o Excel de incidência da banca e envie o PDF do edital
          para a IA gerar ranking de matérias, resumo e conclusões estratégicas.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Prova alvo</h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex. Auditor Fiscal DF)"
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

      {targets.length > 0 && (
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
      )}

      {!targets.length && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Crie uma prova alvo para importar o mapa de incidência.
        </p>
      )}

      {active && userId && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3">
            <div>
              <p className="font-semibold text-slate-900">{active.name}</p>
              {incidenceDoc ? (
                <p className="text-xs text-emerald-800">
                  {incidenceDoc.title} ·{" "}
                  {incidenceDoc.parsed_tables?.parse_stats?.subjects ?? 0} matérias ·{" "}
                  {incidenceDoc.parsed_tables?.parse_stats?.rows_inserted_db ?? 0} linhas
                </p>
              ) : (
                <p className="text-xs text-slate-600">Nenhum Excel importado ainda.</p>
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
              <FileUp className="h-4 w-4" />
              {uploadingExcel
                ? "Importando…"
                : incidenceDoc
                  ? "Substituir Excel"
                  : "Importar Excel (.xlsx)"}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                disabled={uploadingExcel}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadIncidenceExcel(f)
                  e.target.value = ""
                }}
              />
            </label>
          </div>

          <IncidenceHierarchyPanel
            userId={userId}
            examTargetId={active.id}
            reloadKey={hierarchyKey}
          />

          <EditalPrioritiesPanel
            userId={userId}
            examTargetId={active.id}
            examName={active.name}
            hasIncidenceExcel={!!incidenceDoc}
            onAnalysisDone={() => setMappingKey((k) => k + 1)}
          />

          <EditalSubjectMappingPanel
            userId={userId}
            examTargetId={active.id}
            reloadKey={mappingKey}
          />
        </section>
      )}
    </div>
  )
}
