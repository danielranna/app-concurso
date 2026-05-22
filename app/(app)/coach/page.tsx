"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  BookOpen,
  FileText,
  Inbox,
  Sparkles,
  Target,
} from "lucide-react"

type HubData = {
  pending_drafts: number
  pending_reports: number
  report_mode?: "rules" | "llm"
  active_exam: { id: string; name: string } | null
  recent_reports: {
    id: string
    notebook_id: string
    summary_md: string | null
    created_at: string
    structured: { headline?: string }
  }[]
}

export default function CoachHubPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [hub, setHub] = useState<HubData | null>(null)
  const [processing, setProcessing] = useState(false)

  function load(uid: string) {
    fetch(`/api/coach/hub?user_id=${uid}`)
      .then((r) => r.json())
      .then(setHub)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      load(user.id)
    })
  }, [router])

  useEffect(() => {
    const refresh = () => {
      if (userId) load(userId)
    }
    window.addEventListener("coach-ai-credentials-updated", refresh)
    return () =>
      window.removeEventListener("coach-ai-credentials-updated", refresh)
  }, [userId])

  async function processPendingReports() {
    if (!userId) return
    setProcessing(true)
    const { data: notebooks } = await supabase
      .from("notebooks")
      .select("id")
      .eq("user_id", userId)
      .eq("report_pending", true)

    for (const nb of notebooks ?? []) {
      await fetch("/api/coach/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, notebook_id: nb.id }),
      })
    }
    setProcessing(false)
    load(userId)
  }

  return (
    <div className="space-y-6">
      {hub?.report_mode === "rules" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Relatórios por regras (seus erros e tópicos). Para texto com IA, use{" "}
          <strong>Chave de IA</strong> no canto superior — você paga na sua
          conta OpenAI/Anthropic.
        </p>
      )}
      {hub?.report_mode === "llm" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Relatórios com IA ativos usando a sua chave cadastrada.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/coach/inbox"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
        >
          <Inbox className="mb-2 h-5 w-5 text-violet-600" />
          <p className="text-2xl font-bold text-slate-900">
            {hub?.pending_drafts ?? 0}
          </p>
          <p className="text-sm text-slate-500">Ações para aprovar</p>
        </Link>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <Sparkles className="mb-2 h-5 w-5 text-amber-600" />
          <p className="text-2xl font-bold text-slate-900">
            {hub?.pending_reports ?? 0}
          </p>
          <p className="text-sm text-slate-500">Relatórios na fila</p>
          {(hub?.pending_reports ?? 0) > 0 && userId && (
            <button
              type="button"
              onClick={processPendingReports}
              disabled={processing}
              className="mt-2 text-xs font-medium text-violet-700 hover:underline"
            >
              {processing ? "Gerando…" : "Gerar relatórios agora"}
            </button>
          )}
        </div>

        <Link
          href="/coach/editais"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
        >
          <Target className="mb-2 h-5 w-5 text-emerald-600" />
          <p className="text-sm font-semibold text-slate-900">
            {hub?.active_exam?.name ?? "Nenhuma prova ativa"}
          </p>
          <p className="text-sm text-slate-500">Prova alvo</p>
        </Link>

        <Link
          href="/coach/materias"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
        >
          <BookOpen className="mb-2 h-5 w-5 text-sky-600" />
          <p className="text-sm font-semibold text-slate-900">Insights</p>
          <p className="text-sm text-slate-500">Por matéria</p>
        </Link>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <FileText className="h-5 w-5" />
          Relatórios recentes
        </h2>
        {!hub?.recent_reports?.length ? (
          <p className="text-sm text-slate-500">
            Conclua um caderno de questões para gerar o primeiro relatório.
          </p>
        ) : (
          <ul className="space-y-2">
            {hub.recent_reports.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3"
              >
                <p className="font-medium text-slate-900">
                  {r.structured?.headline ??
                    r.summary_md?.slice(0, 80) ??
                    "Relatório de caderno"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
