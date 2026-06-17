"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  MessageCircle,
} from "lucide-react"
import type { SubjectStudyDossierStructured } from "@/lib/coach-types"

type DossierResponse = {
  empty: boolean
  reason?: string
  narrative_md?: string | null
  structured?: SubjectStudyDossierStructured
  source_report_ids?: string[]
  model_used?: string | null
  updated_at?: string
  stale?: boolean
}

type Props = {
  userId: string
  subjectId: string
  subjectName: string
}

function MdBlock({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div
      className={`whitespace-pre-wrap text-sm leading-relaxed text-slate-700 ${className}`}
    >
      {text}
    </div>
  )
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
  badge,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  children: ReactNode
  badge?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
        <Icon className="h-4 w-4 text-indigo-600" />
        <span className="font-semibold text-slate-900">{title}</span>
        {badge && (
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="border-t border-slate-100 px-4 pb-4 pt-2">{children}</div>}
    </div>
  )
}

export default function SubjectDossierPanel({
  userId,
  subjectId,
  subjectName,
}: Props) {
  const [data, setData] = useState<DossierResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ user_id: userId, subject_id: subjectId })
    return fetch(`/api/coach/subject-dossier?${params}`)
      .then((r) => r.json())
      .then((d: DossierResponse) => setData(d))
      .finally(() => setLoading(false))
  }, [userId, subjectId])

  useEffect(() => {
    load()
  }, [load])

  async function regenerate(force = true) {
    setGenerating(true)
    try {
      const res = await fetch("/api/coach/subject-dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          subject_id: subjectId,
          force,
        }),
      })
      const d = (await res.json()) as DossierResponse
      if (!res.ok) {
        alert((d as { error?: string }).error ?? "Erro ao gerar caderno")
        return
      }
      setData(d)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-6">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando Caderno da Matéria…
        </div>
      </section>
    )
  }

  const structured = data?.structured
  const isEmpty = data?.empty || !structured

  return (
    <section className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-700" />
            <h3 className="text-lg font-bold text-slate-900">Caderno da Matéria</h3>
            {data?.stale && !isEmpty && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                Desatualizado
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Relato do cérebro sobre <strong>{subjectName}</strong> — síntese dos seus
            erros explicados nos relatórios de caderno, suas anotações e evolução.
          </p>
        </div>
        <button
          type="button"
          disabled={generating}
          onClick={() => regenerate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isEmpty ? "Gerar caderno" : "Atualizar relato"}
        </button>
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-indigo-200 bg-white/60 p-6 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-indigo-400" />
          <p className="mt-3 text-sm text-slate-700">
            {data?.reason ??
              "Conclua um caderno desta matéria com relatório IA para gerar seu Caderno da Matéria."}
          </p>
          <button
            type="button"
            disabled={generating}
            onClick={() => regenerate(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
          >
            {generating && <Loader2 className="h-4 w-4 animate-spin" />}
            Tentar gerar agora
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-indigo-100 bg-white p-4">
            <h4 className="text-base font-semibold text-indigo-900">
              {structured.headline}
            </h4>
            <MdBlock text={structured.opening_narrative} className="mt-3" />
            {data?.updated_at && (
              <p className="mt-3 text-xs text-slate-400">
                Atualizado em{" "}
                {new Date(data.updated_at).toLocaleString("pt-BR")}
                {data.model_used ? ` · ${data.model_used}` : ""}
              </p>
            )}
          </div>

          {structured.critical_themes.length > 0 && (
            <CollapsibleSection
              title="Lacunas que se repetem"
              icon={AlertTriangle}
              badge={`${structured.critical_themes.length}`}
            >
              <ul className="space-y-4">
                {structured.critical_themes.map((theme) => (
                  <li
                    key={theme.theme}
                    className="rounded-lg border border-red-100 bg-red-50/40 p-3"
                  >
                    <p className="font-medium text-slate-900">{theme.theme}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {theme.topics.join(" · ")}
                    </p>
                    <p className="mt-2 text-xs font-medium text-red-800">
                      {theme.why_it_matters}
                    </p>
                    <MdBlock text={theme.understanding_md} className="mt-2" />
                    {(theme.confusion_pairs ?? []).length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs">
                        {theme.confusion_pairs!.map((p, i) => (
                          <li key={i} className="text-slate-700">
                            <span className="text-red-700 line-through">
                              {p.wrong_belief}
                            </span>
                            {" → "}
                            <span className="font-medium text-emerald-800">
                              {p.correct}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {theme.evidence.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {theme.evidence.map((ev) => (
                          <Link
                            key={ev.question_id}
                            href={`/questoes/questao/${ev.question_id}?return=/coach/materias/${subjectId}/insights`}
                            className="rounded bg-white px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                          >
                            Questão
                            {ev.tec_id ? ` #${ev.tec_id}` : ""}
                            {ev.recurrence > 1 ? ` (${ev.recurrence}×)` : ""}
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {structured.annotation_clarifications.length > 0 && (
            <CollapsibleSection
              title="Suas anotações esclarecidas"
              icon={MessageCircle}
              badge={`${structured.annotation_clarifications.length}`}
              defaultOpen={false}
            >
              <ul className="space-y-3">
                {structured.annotation_clarifications.map((a) => (
                  <li
                    key={a.question_id}
                    className="rounded-lg border border-blue-100 bg-blue-50/50 p-3"
                  >
                    <p className="text-xs font-medium text-blue-800">Sua nota</p>
                    <MdBlock text={a.note_body} className="mt-1 text-blue-900" />
                    <p className="mt-2 text-xs font-medium text-slate-600">
                      Esclarecimento
                    </p>
                    <MdBlock text={a.answer_md} className="mt-1" />
                    <Link
                      href={`/questoes/questao/${a.question_id}?return=/coach/materias/${subjectId}/insights`}
                      className="mt-2 inline-block text-xs font-medium text-indigo-700 hover:underline"
                    >
                      Ver questão →
                    </Link>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {structured.evolutions.length > 0 && (
            <CollapsibleSection
              title="O que você já internalizou"
              icon={TrendingUp}
              badge={`${structured.evolutions.length}`}
            >
              <ul className="space-y-3">
                {structured.evolutions.map((e) => (
                  <li
                    key={e.topic}
                    className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3"
                  >
                    <p className="font-medium text-emerald-900">{e.topic}</p>
                    {e.previous_misconception && (
                      <p className="mt-1 text-xs text-slate-600">
                        Antes: {e.previous_misconception}
                      </p>
                    )}
                    <p className="mt-2 text-sm text-slate-700">{e.evidence}</p>
                    {e.encouragement && (
                      <p className="mt-1 text-sm font-medium text-emerald-800">
                        {e.encouragement}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {structured.still_attention.length > 0 && (
            <CollapsibleSection
              title="Ainda precisa de atenção"
              icon={AlertTriangle}
              defaultOpen={false}
            >
              <ul className="space-y-2">
                {structured.still_attention.map((s) => (
                  <li
                    key={s.topic}
                    className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-sm"
                  >
                    <p className="font-medium text-slate-900">{s.topic}</p>
                    <p className="mt-1 text-slate-600">{s.reason}</p>
                    <p className="mt-1 text-xs text-amber-900">{s.action}</p>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {structured.study_blocks.length > 0 && (
            <CollapsibleSection
              title="Blocos de estudo"
              icon={BookOpen}
              badge={`${structured.study_blocks.length}`}
            >
              <ul className="space-y-4">
                {structured.study_blocks.map((block) => (
                  <li
                    key={block.title}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="font-semibold text-slate-900">{block.title}</p>
                    <MdBlock text={block.content_md} className="mt-2" />
                    {block.question_ids.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {block.question_ids.map((qid) => (
                          <Link
                            key={qid}
                            href={`/questoes/questao/${qid}?return=/coach/materias/${subjectId}/insights`}
                            className="rounded bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-200"
                          >
                            Resolver
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {(data?.source_report_ids ?? []).length > 0 && (
            <p className="text-xs text-slate-500">
              Baseado em {data!.source_report_ids!.length} relatório(s) de caderno.
              {data!.stale && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => regenerate(true)}
                    className="font-medium text-indigo-700 underline"
                  >
                    Atualizar
                  </button>{" "}
                  para incluir relatórios novos.
                </>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
