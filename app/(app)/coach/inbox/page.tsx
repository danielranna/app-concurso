"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ReportSourceBadge from "@/components/coach/ReportSourceBadge"
import { Check, ExternalLink, Loader2, Sparkles, X } from "lucide-react"
import type { AiActionDraft } from "@/lib/coach-types"

type PendingReportNotebook = {
  id: string
  name: string | null
  completed_at: string | null
}

type InboxData = {
  drafts: AiActionDraft[]
  pending_reports: PendingReportNotebook[]
}

function draftReportModel(payload: Record<string, unknown> | null) {
  const v = payload?.report_model_used
  return typeof v === "string" ? v : null
}

function formatDraftPayload(d: AiActionDraft) {
  if (d.type !== "notebook_create" || !d.payload) return null
  const p = d.payload as Record<string, unknown>
  const topics = Array.isArray(p.tec_topics)
    ? (p.tec_topics as string[]).join(", ")
    : ""
  const name = String(p.suggested_name ?? d.label)
  const minWrong = p.min_wrong_attempts
  return {
    name,
    topics,
    minWrong: typeof minWrong === "number" ? minWrong : undefined,
  }
}

export default function CoachInboxPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [data, setData] = useState<InboxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [completed, setCompleted] = useState<Record<string, string>>({})
  const [generateErrors, setGenerateErrors] = useState<Record<string, string>>({})

  function reload(uid: string) {
    setLoading(true)
    fetch(`/api/coach/inbox?user_id=${uid}&status=pending`)
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json)) {
          setData({ drafts: json, pending_reports: [] })
        } else {
          setData({
            drafts: json.drafts ?? [],
            pending_reports: json.pending_reports ?? [],
          })
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reload(user.id)
    })
  }, [router])

  async function generateReport(notebookId: string) {
    if (!userId) return
    setGeneratingId(notebookId)
    setGenerateErrors((prev) => {
      const next = { ...prev }
      delete next[notebookId]
      return next
    })
    try {
      const res = await fetch("/api/coach/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, notebook_id: notebookId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setGenerateErrors((prev) => ({
          ...prev,
          [notebookId]: json.error ?? "Erro ao gerar relatório",
        }))
        return
      }
      setCompleted((prev) => ({
        ...prev,
        [notebookId]: json.report_id as string,
      }))
      reload(userId)
    } catch {
      setGenerateErrors((prev) => ({
        ...prev,
        [notebookId]: "Falha de rede. Tente de novo.",
      }))
    } finally {
      setGeneratingId(null)
    }
  }

  async function act(id: string, action: "approve" | "reject") {
    if (!userId) return
    setBusy(id)
    const res = await fetch(`/api/coach/inbox/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, action }),
    })
    const json = await res.json()
    setBusy(null)
    if (json.error) {
      alert(json.error)
      return
    }
    if (action === "approve" && json.result?.notebook_id) {
      router.push(`/questoes/cadernos/${json.result.notebook_id}`)
      return
    }
    reload(userId)
  }

  const drafts = data?.drafts ?? []
  const pendingReports = data?.pending_reports ?? []
  const visiblePending = pendingReports.filter((nb) => !completed[nb.id])

  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-600">
        Relatórios de cadernos concluídos e sugestões vindas desses relatórios.
        Gerar relatório pode levar alguns minutos. Aprovar uma ação só cria o
        caderno de reforço — não gasta API de novo.
      </p>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-amber-600" />
          Relatórios pendentes
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Cadernos concluídos aguardando relatório. Clique em Gerar quando quiser.
        </p>

        {loading ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Carregando…
          </p>
        ) : visiblePending.length === 0 &&
          Object.keys(completed).length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Nenhum relatório pendente.
          </p>
        ) : (
          <ul className="space-y-3">
            {pendingReports.map((nb) => {
              const reportId = completed[nb.id]
              const isGenerating = generatingId === nb.id
              const err = generateErrors[nb.id]

              if (reportId) {
                return (
                  <li
                    key={nb.id}
                    className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Concluído
                        </span>
                        <p className="mt-2 font-medium text-slate-900">
                          {nb.name?.trim() || "Caderno sem nome"}
                        </p>
                        {nb.completed_at && (
                          <p className="mt-1 text-xs text-slate-500">
                            Concluído em{" "}
                            {new Date(nb.completed_at).toLocaleString("pt-BR")}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/coach/relatorios/${reportId}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800"
                      >
                        Ver relatório
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </li>
                )
              }

              return (
                <li
                  key={nb.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Aguardando relatório
                      </span>
                      <p className="mt-2 font-medium text-slate-900">
                        {nb.name?.trim() || "Caderno sem nome"}
                      </p>
                      {nb.completed_at && (
                        <p className="mt-1 text-xs text-slate-500">
                          Concluído em{" "}
                          {new Date(nb.completed_at).toLocaleString("pt-BR")}
                        </p>
                      )}
                      {err && (
                        <p className="mt-2 text-sm text-red-600">{err}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isGenerating || Boolean(generatingId)}
                      onClick={() => generateReport(nb.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Gerando…
                        </>
                      ) : (
                        "Gerar"
                      )}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold text-slate-900">
          Ações para aprovar
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Sugestões vindas do relatório do caderno. O selo indica se o relatório
          foi por <strong>regras</strong> ou <strong>IA</strong>.
        </p>

        {loading ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Carregando…
          </p>
        ) : !drafts.length ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Nenhuma ação pendente.
          </p>
        ) : (
          <ul className="space-y-3">
            {drafts.map((d) => {
              const formatted = formatDraftPayload(d)
              const reportModel = draftReportModel(
                d.payload as Record<string, unknown> | null
              )
              return (
                <li
                  key={d.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {d.type === "notebook_create"
                            ? "Caderno de reforço"
                            : d.type}
                        </span>
                        {d.source_agent === "notebook_report" && (
                          <ReportSourceBadge modelUsed={reportModel} />
                        )}
                      </div>
                      <p className="mt-2 font-medium text-slate-900">
                        {d.label}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Relatório de caderno ·{" "}
                        {new Date(d.created_at).toLocaleString("pt-BR")}
                      </p>
                      {formatted ? (
                        <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                          <li>Nome: {formatted.name}</li>
                          {formatted.topics && (
                            <li>Tópico: {formatted.topics}</li>
                          )}
                          {formatted.minWrong != null && (
                            <li>
                              Mín. de erros no caderno: {formatted.minWrong}
                            </li>
                          )}
                        </ul>
                      ) : (
                        <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                          {JSON.stringify(d.payload, null, 2)}
                        </pre>
                      )}
                      {d.source_agent === "notebook_report" && !reportModel && (
                        <p className="mt-2 text-xs text-slate-500">
                          Ação criada antes da etiqueta de origem — confira o
                          relatório em Visão geral (selo Regras ou IA).
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy === d.id}
                        onClick={() => act(d.id, "approve")}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busy === d.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={busy === d.id}
                        onClick={() => act(d.id, "reject")}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        Descartar
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
