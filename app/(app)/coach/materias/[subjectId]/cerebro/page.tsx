"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { BrainDetailPayload } from "@/lib/ai/brain-detail"
import BrainDetailHeader from "@/components/coach/brain/BrainDetailHeader"
import BrainHowItWorks from "@/components/coach/brain/BrainHowItWorks"
import BrainOverviewCards from "@/components/coach/brain/BrainOverviewCards"
import BrainTopicMap from "@/components/coach/brain/BrainTopicMap"
import BrainSignalsList from "@/components/coach/brain/BrainSignalsList"
import BrainMetacognitionCharts from "@/components/coach/brain/BrainMetacognitionCharts"
import BrainReportsTimeline from "@/components/coach/brain/BrainReportsTimeline"
import BrainPriorityBridge from "@/components/coach/brain/BrainPriorityBridge"

export default function CoachCerebroPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [data, setData] = useState<BrainDetailPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)

  const load = useCallback(
    (uid: string) => {
      setLoading(true)
      return fetch(
        `/api/coach/brain/detail?user_id=${uid}&subject_id=${subjectId}`
      )
        .then((r) => r.json())
        .then((json) => {
          if (json.error) {
            console.error(json.error)
            return
          }
          setData(json as BrainDetailPayload)
        })
        .finally(() => setLoading(false))
    },
    [subjectId]
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      load(user.id)
    })
  }, [router, load])

  async function handleRecompute() {
    if (!userId) return
    setRecomputing(true)
    try {
      const res = await fetch("/api/coach/brain/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, subject_id: subjectId }),
      })
      const json = await res.json()
      if (!res.ok) alert(json.error ?? "Erro ao atualizar")
      else await load(userId)
    } finally {
      setRecomputing(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        Carregando cérebro da matéria…
      </div>
    )
  }

  const overview = data?.overview
  const hasAttempts = (overview?.total_attempts ?? 0) > 0
  const hasBrainTopics = (data?.topics.length ?? 0) > 0

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/coach/materias/${subjectId}/insights`}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos insights
      </Link>

      {data?.mapping_status.unmapped_hint && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">Mapeamento TEC necessário</p>
          <p className="mt-1 text-sm text-amber-800">
            Esta matéria ainda não tem matérias TEC vinculadas. O cérebro só consegue
            agrupar questões depois do mapeamento.
          </p>
          <Link
            href="/questoes/mapeamento"
            className="mt-2 inline-block text-sm font-medium text-amber-900 underline"
          >
            Associar matérias e assuntos →
          </Link>
        </div>
      )}

      {data && (
        <BrainDetailHeader
          subjectName={data.subject_name}
          updatedAt={data.updated_at}
          trend={data.overview.trend}
          summaryMd={data.summary_md}
          lastReportId={data.last_report_id}
          reportMerged={data.overview.report_merged}
          dangerCount={data.overview.danger_topics_count}
          topicCount={data.overview.topic_count}
          recomputing={recomputing}
          onRecompute={handleRecompute}
        />
      )}

      <BrainHowItWorks />

      {data && <BrainOverviewCards overview={data.overview} />}

      {!hasAttempts && data?.mapping_status.has_mapping && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-800">O cérebro ainda não tem dados</p>
          <p className="mt-2 text-sm text-slate-600">
            Resolva questões em cadernos desta matéria. Cada resposta alimenta o mapa;
            ao concluir um caderno, o relatório IA refina equívocos e taxonomia de erro.
          </p>
          <Link
            href={`/questoes/materia/${subjectId}`}
            className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            Ir para cadernos da matéria →
          </Link>
        </div>
      )}

      {data && userId && hasBrainTopics && (
        <BrainTopicMap
          userId={userId}
          subjectId={subjectId}
          topics={data.topics}
          statusDistribution={data.status_distribution}
        />
      )}

      {data && (
        <BrainSignalsList
          signals={data.signals}
          dangerTopicKeys={data.brain?.danger_topics ?? []}
        />
      )}

      {data && hasAttempts && (
        <BrainMetacognitionCharts
          outcomeDistribution={data.outcome_distribution}
          errorTaxonomyDistribution={data.error_taxonomy_distribution}
        />
      )}

      {data && (
        <BrainPriorityBridge
          subjectId={subjectId}
          items={data.brain_performance_top}
        />
      )}

      {data && <BrainReportsTimeline reports={data.recent_reports} />}
    </div>
  )
}
