"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Loader2, Save } from "lucide-react"

type StudyMode = "pre_edital" | "pos_edital" | "reta_final"

const MODE_LABELS: Record<StudyMode, string> = {
  pre_edital: "Pré-edital",
  pos_edital: "Pós-edital",
  reta_final: "Reta final",
}

const MODE_HELP: Record<StudyMode, string> = {
  pre_edital:
    "Fila cérebro (só fraqueza). Use Ciclo de estudo para planejar ou pause para seguir a consultoria.",
  pos_edital:
    "Fila cruzada: incidência × fraqueza. Matérias do edital ativo.",
  reta_final:
    "Menos matérias por dia, mais questões por bloco; foco intenso.",
}

export default function CoachConfiguracoesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [studyMode, setStudyMode] = useState<StudyMode>("pre_edital")
  const [rotateSubjects, setRotateSubjects] = useState(true)
  const [questions, setQuestions] = useState(50)
  const [flashcards, setFlashcards] = useState(20)
  const [summaries, setSummaries] = useState(2)
  const [errorReviews, setErrorReviews] = useState(10)
  const [explainWrong, setExplainWrong] = useState(true)
  const [llmDailyCap, setLlmDailyCap] = useState(15)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/coach/preferences?user_id=${user.id}`)
        .then((r) => r.json())
        .then((d) => {
          const st = d.study ?? {}
          const rp = d.report ?? {}
          setStudyMode(st.study_mode ?? "pre_edital")
          setRotateSubjects(st.rotate_subjects ?? true)
          const lim = st.daily_limits ?? {}
          setQuestions(Number(lim.questions ?? 50))
          setFlashcards(Number(lim.flashcards ?? 20))
          setSummaries(Number(lim.summaries ?? 2))
          setErrorReviews(Number(lim.error_reviews ?? 10))
          setExplainWrong(rp.explain_wrong ?? true)
          setLlmDailyCap(Number(rp.max_llm_explanations_per_day ?? 15))
        })
        .finally(() => setLoading(false))
    })
  }, [router])

  async function save() {
    if (!userId) return
    setSaving(true)
    setSaved(false)
    const res = await fetch("/api/coach/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        study: {
          study_mode: studyMode,
          rotate_subjects: rotateSubjects,
          daily_limits: {
            questions,
            flashcards,
            summaries,
            error_reviews: errorReviews,
          },
        },
        report: {
          explain_wrong: explainWrong,
          max_llm_explanations_per_day: llmDailyCap,
        },
      }),
    })
    setSaving(false)
    if (res.ok) setSaved(true)
    else alert("Erro ao salvar")
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <Link
        href="/coach"
        className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao Coach
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-slate-900">Configurações do Coach</h1>
        <p className="mt-1 text-sm text-slate-600">
          Modo de estudo, limites diários e opções de relatório.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Fase do concurso
        </h2>
        <div className="space-y-2">
          {(Object.keys(MODE_LABELS) as StudyMode[]).map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                studyMode === m
                  ? "border-violet-400 bg-violet-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="study_mode"
                checked={studyMode === m}
                onChange={() => setStudyMode(m)}
                className="mt-1"
              />
              <div>
                <span className="font-medium text-slate-900">{MODE_LABELS[m]}</span>
                <p className="text-xs text-slate-600">{MODE_HELP[m]}</p>
              </div>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={rotateSubjects}
            onChange={(e) => setRotateSubjects(e.target.checked)}
            disabled={studyMode === "reta_final"}
          />
          Rotacionar matérias no plano (erradas por matéria por rodada até o limite)
        </label>
        <p className="text-xs text-slate-500">
          <Link href="/coach/executor" className="font-medium text-violet-700 hover:underline">
            Gerenciar matérias do executor →
          </Link>
          {" · "}
          <Link href="/ciclo" className="font-medium text-teal-700 hover:underline">
            Ciclo de estudo (pré-edital) →
          </Link>
        </p>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Limites diários (plano de hoje)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Questões / dia</span>
            <input
              type="number"
              min={5}
              max={200}
              value={questions}
              onChange={(e) => setQuestions(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Flashcards / dia</span>
            <input
              type="number"
              min={0}
              max={100}
              value={flashcards}
              onChange={(e) => setFlashcards(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Resumos / dia</span>
            <input
              type="number"
              min={0}
              max={10}
              value={summaries}
              onChange={(e) => setSummaries(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Revisões de erro / dia</span>
            <input
              type="number"
              min={0}
              max={50}
              value={errorReviews}
              onChange={(e) => setErrorReviews(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          As questões do dia vão para <strong>um único caderno</strong> — só
          questões que você já errou e tópicos não consolidados no cérebro.
          Flashcards e resumos vão para a Inbox como rascunhos.
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Relatório de caderno
        </h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={explainWrong}
            onChange={(e) => setExplainWrong(e.target.checked)}
          />
          Explicar questões erradas com IA
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">
            Explicações com IA por dia (relatório)
          </span>
          <input
            type="number"
            min={0}
            max={80}
            value={llmDailyCap}
            onChange={(e) => setLlmDailyCap(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <p className="text-xs text-slate-500">
          Limite de chamadas LLM para classificação e explicações no relatório de
          caderno.
        </p>
      </section>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Salvar configurações
      </button>
      {saved && (
        <p className="text-center text-sm text-emerald-700">
          Salvo. Regenerar o plano em{" "}
          <Link href="/coach/hoje" className="font-medium underline">
            Hoje
          </Link>{" "}
          para aplicar.
        </p>
      )}
    </div>
  )
}
