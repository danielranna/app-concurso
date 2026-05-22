"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ReportSourceBadge from "@/components/coach/ReportSourceBadge"
import { Check, Loader2, X } from "lucide-react"
import type { AiActionDraft } from "@/lib/coach-types"

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
    minWrong:
      typeof minWrong === "number" ? minWrong : undefined,
  }
}

export default function CoachInboxPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<AiActionDraft[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  function reload(uid: string) {
    fetch(`/api/coach/inbox?user_id=${uid}&status=pending`)
      .then((r) => r.json())
      .then(setDrafts)
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

  async function act(id: string, action: "approve" | "reject") {
    if (!userId) return
    setBusy(id)
    const res = await fetch(`/api/coach/inbox/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, action }),
    })
    const data = await res.json()
    setBusy(null)
    if (data.error) {
      alert(data.error)
      return
    }
    if (action === "approve" && data.result?.notebook_id) {
      router.push(`/questoes/cadernos/${data.result.notebook_id}`)
      return
    }
    reload(userId)
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Sugestões vindas do relatório do caderno. Aprovar só cria o caderno de
        reforço — não gasta API de novo. O selo indica se o relatório foi por{" "}
        <strong>regras</strong> ou <strong>IA</strong>.
      </p>

      {!drafts.length ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
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
                  <p className="mt-2 font-medium text-slate-900">{d.label}</p>
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
                        <li>Mín. de erros no caderno: {formatted.minWrong}</li>
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
          )})}
        </ul>
      )}
    </div>
  )
}
