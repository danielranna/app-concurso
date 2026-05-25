"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Sparkles, ChevronDown, ChevronRight } from "lucide-react"
import type {
  StrategicAnalysisPayload,
  StrategicEnrichment,
  StrategicMdBundle,
} from "@/lib/strategic-md-types"

export default function StrategicExamDashboard({
  userId,
  examTargetId,
  onEnrich,
  enriching,
}: {
  userId: string
  examTargetId: string
  onEnrich: () => void
  enriching: boolean
}) {
  const [data, setData] = useState<
    (StrategicAnalysisPayload & {
      topic_ranking?: { subject: string; topic: string; quantity: number; percent: number }[]
      bundle_refreshed?: boolean
    }) | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [openHierarchy, setOpenHierarchy] = useState<Set<string>>(new Set())
  const [openTopicMap, setOpenTopicMap] = useState<Set<string>>(new Set())
  const [filterSubject, setFilterSubject] = useState<string>("")

  const load = useCallback(() => {
    setLoading(true)
    fetch(
      `/api/coach/exam-targets/${examTargetId}/strategic-analysis?user_id=${userId}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.error) alert(d.error)
        else setData(d)
      })
      .finally(() => setLoading(false))
  }, [userId, examTargetId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando painel estratégico…
      </div>
    )
  }

  if (!data?.bundle) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
        Importe o arquivo <strong>.md</strong> de análise estratégica para ver o painel
        completo.
      </div>
    )
  }

  const bundle = data.bundle as StrategicMdBundle
  const enrichment = (data.enrichment ?? {}) as StrategicEnrichment

  function subjectLabel(slug: string) {
    return (
      bundle.edital_subjects.find((s) => s.slug === slug)?.name ??
      bundle.incidence_subjects.find((s) => s.slug === slug)?.name ??
      slug
    )
  }

  const topicRankingFromBundle = Object.entries(bundle.topics_by_slug)
    .flatMap(([slug, topics]) =>
      (topics ?? []).map((t) => ({
        subject: subjectLabel(slug),
        topic: t.topic,
        quantity: t.quantity,
        percent: t.percent,
      }))
    )
    .sort((a, b) => b.quantity - a.quantity)

  const topicRanking =
    (data.topic_ranking?.length ? data.topic_ranking : topicRankingFromBundle) ?? []

  const subjectsWithTopics = Object.entries(bundle.topics_by_slug)
    .filter(([, rows]) => (rows?.length ?? 0) > 0)
    .sort((a, b) => subjectLabel(a[0]).localeCompare(subjectLabel(b[0]), "pt"))

  const activeParseWarnings = bundle.parse_warnings.filter((w) => {
    const slugMatch = w.match(/\(([a-z0-9-]+)\)\s*$/)
    if (!slugMatch) return true
    const slug = slugMatch[1]!
    const isMissingTopic =
      w.includes("Sem tabela de tópicos") || w.includes("só nota ou seção ausente")
    if (!isMissingTopic) return true
    return !(bundle.topics_by_slug[slug]?.length)
  })

  const filteredTopics = filterSubject
    ? topicRanking.filter((t) => t.subject === filterSubject)
    : topicRanking

  function toggleHierarchy(subject: string) {
    setOpenHierarchy((prev) => {
      const next = new Set(prev)
      if (next.has(subject)) next.delete(subject)
      else next.add(subject)
      return next
    })
  }

  function toggleTopicMap(slug: string) {
    setOpenTopicMap((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Painel estratégico</h3>
          <p className="text-sm text-slate-600">
            Dados do MD importado
            {data.incidence_row_count > 0 &&
              ` · ${data.incidence_row_count} tópicos no banco`}
            {subjectsWithTopics.length > 0 &&
              ` · ${subjectsWithTopics.length} matérias com mapa de assuntos`}
          </p>
          {data.bundle_refreshed && (
            <p className="text-xs text-emerald-700">
              Tópicos atualizados automaticamente a partir do texto do MD.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onEnrich}
          disabled={enriching}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
        >
          {enriching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Enriquecer com IA (gpt-4o)
        </button>
      </div>

      {/* 1. Índice de previsibilidade */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 font-semibold text-slate-900">Índice de previsibilidade</h4>
        <p className="mb-3 text-xs text-slate-500">
          Estável = histórico concentrado; imprevisível = tópicos dispersos ou pouco cobrados.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(enrichment.predictability_index ?? []).map((p) => (
            <div
              key={p.slug}
              className={`rounded-lg border px-3 py-2 text-sm ${
                p.label === "estavel"
                  ? "border-emerald-200 bg-emerald-50"
                  : p.label === "imprevisivel"
                    ? "border-amber-200 bg-amber-50"
                    : "border-slate-200 bg-slate-50"
              }`}
            >
              <p className="font-medium text-slate-900">{p.subject}</p>
              <p className="text-xs text-slate-600">
                {p.label} · score {p.score}
              </p>
              <p className="mt-1 text-xs text-slate-500 line-clamp-2">{p.why}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Ranking matérias */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 font-semibold text-slate-900">Ranking de matérias (peso edital)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Matéria</th>
                <th className="py-1 pr-2">Prova</th>
                <th className="py-1 pr-2">Itens</th>
                <th className="py-1 pr-2">Peso</th>
              </tr>
            </thead>
            <tbody>
              {bundle.subject_ranking.map((r) => (
                <tr key={r.slug} className="border-t border-slate-50">
                  <td className="py-2 pr-2 text-slate-400">{r.ranking}</td>
                  <td className="py-2 pr-2 font-medium">{r.name}</td>
                  <td className="py-2 pr-2">{r.prova ?? "—"}</td>
                  <td className="py-2 pr-2">{r.itens ?? "—"}</td>
                  <td className="py-2 pr-2 text-violet-700 font-medium">
                    {r.peso_relativo ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Ranking assuntos */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 font-semibold text-slate-900">Ranking de assuntos</h4>
        <select
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          className="mb-3 rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">Todas as matérias</option>
          {[...new Set(topicRanking.map((t) => t.subject))].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {topicRanking.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum assunto com tabela no MD. Matérias só com nota aparecem nos avisos
            abaixo.
          </p>
        ) : (
          <ol className="space-y-1 text-sm">
            {filteredTopics.slice(0, 25).map((t, i) => (
              <li key={`${t.subject}-${t.topic}`} className="flex justify-between gap-2">
                <span>
                  <span className="text-slate-400 mr-2">{i + 1}.</span>
                  <span className="font-medium">{t.topic}</span>
                  <span className="text-xs text-slate-500 ml-1">({t.subject})</span>
                </span>
                <span className="shrink-0 text-emerald-700">
                  {t.percent.toFixed(1)}% · {t.quantity} quest.
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Mapa de incidência por assunto (cada matéria) */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
        <h4 className="mb-1 font-semibold text-slate-900">
          Mapa de incidência por assunto (por matéria)
        </h4>
        <p className="mb-3 text-xs text-slate-600">
          Tópicos extraídos da seção «Tópicos Mais Incidentes» do MD. Expanda cada matéria
          para ver assunto, quantidade histórica e % dentro da matéria.
        </p>
        {subjectsWithTopics.length === 0 ? (
          <p className="text-sm text-amber-800">
            Nenhuma tabela de tópicos no documento salvo. Recarregue a página (o app
            reprocessa o MD automaticamente) ou use «Atualizar tópicos do MD» em Editais.
          </p>
        ) : (
          <ul className="space-y-2">
            {subjectsWithTopics.map(([slug, topics]) => {
              const open = openTopicMap.has(slug)
              const total = topics.reduce((s, t) => s + t.quantity, 0)
              return (
                <li key={slug} className="rounded-lg border border-white bg-white">
                  <button
                    type="button"
                    onClick={() => toggleTopicMap(slug)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-900"
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    <span className="flex-1">{subjectLabel(slug)}</span>
                    <span className="text-xs font-normal text-slate-500">
                      {topics.length} assuntos · {total} quest.
                    </span>
                  </button>
                  {open && (
                    <div className="overflow-x-auto border-t border-slate-100 px-3 pb-2">
                      <table className="mt-2 w-full text-sm">
                        <thead className="text-left text-xs text-slate-500">
                          <tr>
                            <th className="py-1 pr-2">#</th>
                            <th className="py-1 pr-2">Assunto</th>
                            <th className="py-1 pr-2">Questões</th>
                            <th className="py-1 pr-2">% na matéria</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...topics]
                            .sort((a, b) => b.quantity - a.quantity)
                            .map((t, i) => (
                              <tr key={t.topic} className="border-t border-slate-50">
                                <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                                <td className="py-1.5 pr-2">{t.topic}</td>
                                <td className="py-1.5 pr-2">{t.quantity}</td>
                                <td className="py-1.5 pr-2 text-emerald-700">
                                  {t.percent.toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 4. Mapa incidência */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 font-semibold text-slate-900">Mapa de incidência (banca)</h4>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1">#</th>
              <th className="py-1">Matéria</th>
              <th className="py-1">Histórico</th>
              <th className="py-1">%</th>
              <th className="py-1">Classificação</th>
            </tr>
          </thead>
          <tbody>
            {bundle.incidence_subjects.map((r) => (
              <tr key={r.slug} className="border-t border-slate-50">
                <td className="py-2">{r.ranking_incidencia}</td>
                <td className="py-2 font-medium">{r.name}</td>
                <td className="py-2">{r.total_historico ?? "—"}</td>
                <td className="py-2 text-emerald-700">
                  {r.incidencia_relativa_pct != null
                    ? `${r.incidencia_relativa_pct}%`
                    : "—"}
                </td>
                <td className="py-2 text-xs">{r.classificacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 5. Peso no edital */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 font-semibold text-slate-900">Peso no edital (itens por prova)</h4>
        <div className="grid gap-4 md:grid-cols-2">
          {(["P1", "P2"] as const).map((prova) => (
            <div key={prova}>
              <p className="mb-2 text-xs font-medium text-slate-500">{prova}</p>
              <ul className="space-y-1 text-sm">
                {bundle.edital_subjects
                  .filter((s) => s.prova === prova)
                  .map((s) => (
                    <li key={s.slug} className="flex justify-between">
                      <span>{s.name}</span>
                      <span className="font-medium text-violet-700">{s.itens} itens</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Mapa hierárquico */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
        <h4 className="mb-3 font-semibold text-slate-900">Mapa hierárquico do edital</h4>
        {!enrichment.edital_hierarchy?.length ? (
          <p className="text-sm text-slate-600">
            Clique em &quot;Enriquecer com IA&quot; para gerar a árvore de matérias → assuntos →
            subtópicos.
          </p>
        ) : (
          <ul className="space-y-2">
            {enrichment.edital_hierarchy.map((sub) => {
              const open = openHierarchy.has(sub.subject)
              return (
                <li key={sub.subject} className="rounded-lg border border-white bg-white">
                  <button
                    type="button"
                    onClick={() => toggleHierarchy(sub.subject)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold"
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    {sub.subject}
                  </button>
                  {open && (
                    <ul className="border-t border-slate-100 px-6 pb-2 text-sm">
                      {sub.children?.map((ch) => (
                        <li key={ch.topic} className="py-1">
                          <span className="font-medium">{ch.topic}</span>
                          {ch.children?.length > 0 && (
                            <ul className="ml-4 text-xs text-slate-600">
                              {ch.children.map((c) => (
                                <li key={c.topic}>· {c.topic}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 7. Assuntos nucleares */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <h4 className="mb-3 font-semibold text-slate-900">Assuntos nucleares</h4>
        <ul className="space-y-2 text-sm">
          {(enrichment.nuclear_topics ?? []).map((n, i) => (
            <li key={i} className="rounded-lg bg-white px-3 py-2 border border-amber-100">
              <p className="font-medium text-slate-900">
                {n.subject} — {n.topic}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">{n.why}</p>
            </li>
          ))}
        </ul>
      </div>

      {activeParseWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">Avisos do parser</p>
          <p className="mt-0.5 text-amber-800">
            {subjectsWithTopics.length} matéria(s) com tabela de assuntos no MD ·{" "}
            {activeParseWarnings.filter((w) => w.includes("Sem tabela")).length} sem
            tabela (só nota ou seção ausente)
          </p>
          <ul className="mt-1 list-inside list-disc">
            {activeParseWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
