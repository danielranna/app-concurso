"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type QueueCard = {
  id: string
  statement: string | null
  from_error: boolean
  knowledge_summary: string | null
  recurrence_count: number | null
  error_id: string | null
}

type AnswerResult = {
  is_correct: boolean
  correct_answer: string
  explanation: string
  due_at: string
  learning_status: string
}

export default function ErrosRevisaoPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [card, setCard] = useState<QueueCard | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [result, setResult] = useState<AnswerResult | null>(null)

  const loadQueue = useCallback(async (uid: string) => {
    setLoading(true)
    setResult(null)
    const res = await fetch(`/api/erros/revisao/queue?user_id=${uid}`)
    const data = await res.json()
    setLoading(false)
    if (!data.card) {
      setDone(true)
      setCard(null)
      return
    }
    setDone(false)
    setCard(data.card)
    setRemaining(data.remaining ?? 0)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      loadQueue(user.id)
    })
  }, [router, loadQueue])

  async function answer(selected: "Certo" | "Errado") {
    if (!userId || !card || answering) return
    setAnswering(true)
    try {
      const res = await fetch("/api/erros/revisao/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          card_id: card.id,
          selected_answer: selected,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao responder")
      setResult(data)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Erro ao responder")
    } finally {
      setAnswering(false)
    }
  }

  function advance() {
    if (!userId) return
    loadQueue(userId)
  }

  if (loading && !card) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-sm text-slate-600">
        Carregando revisão de erros…
      </div>
    )
  }

  if (done || !card) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-xl font-semibold text-slate-900">Revisão de erros</h1>
        <p className="text-sm text-slate-600">
          Não há assertivas de revisão pendentes agora. O FSRS define quando voltam.
        </p>
        <div className="flex gap-3 text-sm">
          <Link href="/erros" className="text-blue-600 hover:underline">
            Caderno de erros
          </Link>
          <Link href="/flashcards/study" className="text-blue-600 hover:underline">
            Flashcards
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Revisão de erros</h1>
          <p className="mt-1 text-xs text-slate-500">
            {remaining + 1} na fila · deck Revisão de Erros · FSRS
          </p>
        </div>
        <Link href="/erros" className="text-sm text-slate-600 hover:underline">
          Caderno
        </Link>
      </div>

      {card.from_error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Veio de um erro anterior
          {card.knowledge_summary ? ` · ${card.knowledge_summary}` : ""}
          {card.recurrence_count && card.recurrence_count > 1
            ? ` · ${card.recurrence_count}× no caderno`
            : ""}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Assertiva (certo ou errado)
        </p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
          {card.statement}
        </p>

        {!result ? (
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              disabled={answering}
              onClick={() => answer("Certo")}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Certo
            </button>
            <button
              type="button"
              disabled={answering}
              onClick={() => answer("Errado")}
              className="flex-1 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Errado
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div
              className={`rounded-lg p-4 text-sm ${
                result.is_correct
                  ? "bg-emerald-50 text-emerald-900"
                  : "bg-rose-50 text-rose-900"
              }`}
            >
              {result.is_correct ? "Você acertou." : "Você errou."} Gabarito:{" "}
              <strong>{result.correct_answer}</strong>
            </div>
            {result.explanation && (
              <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-800">
                <p className="mb-1 text-xs font-semibold text-slate-600">Explicação</p>
                <p className="whitespace-pre-wrap leading-relaxed">{result.explanation}</p>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Próxima revisão (FSRS):{" "}
              {result.due_at
                ? new Date(result.due_at).toLocaleString("pt-BR")
                : "—"}
            </p>
            <button
              type="button"
              onClick={advance}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Avançar
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
