"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"

type Origin = {
  question_id: string | null
  tec_id: number | null
  tec_url: string | null
  app_href: string | null
}

type QueueCard = {
  id: string
  statement: string | null
  from_error: boolean
  is_first_review?: boolean
  recurrence_count: number | null
  error_id: string | null
  subject_id: string | null
  subject_name: string | null
  origin: Origin | null
}

type Preview = { again: string; hard: string; good: string; easy: string }

type CheckResult = {
  is_correct: boolean
  correct_answer: string
  explanation: string
  selected: string
  preview: Preview
  suggested_rating: number
  is_first_review?: boolean
}

type ScheduleRow = {
  card_id: string
  error_id: string | null
  statement_preview: string
  subject_id: string | null
  subject_name: string | null
  created_at: string
  next_review_at: string | null
  app_href: string | null
}

const RATING_HELP: Record<number, { label: string; title: string }> = {
  1: {
    label: "Again",
    title: "Errei — o card volta cedo à fila.",
  },
  2: {
    label: "Hard",
    title: "No 1º review: 1 dia. Depois: FSRS Hard.",
  },
  3: {
    label: "Good",
    title: "No 1º review: 3 dias. Depois: FSRS Good.",
  },
  4: {
    label: "Easy",
    title: "No 1º review: 7 dias. Depois: FSRS Easy.",
  },
}

function OriginLinks({ origin }: { origin: Origin | null }) {
  if (!origin?.app_href && !origin?.tec_url) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {origin.tec_id != null && (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
          TEC #{origin.tec_id}
        </span>
      )}
      {origin.app_href && (
        <Link
          href={origin.app_href}
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Questão original
        </Link>
      )}
      {origin.tec_url && (
        <a
          href={origin.tec_url}
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Abrir no TEC
        </a>
      )}
    </div>
  )
}

function formatDt(iso: string | null) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

export default function ErrosRevisaoPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [card, setCard] = useState<QueueCard | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [openCount, setOpenCount] = useState(0)
  const [sessionTotal, setSessionTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [checking, setChecking] = useState(false)
  const [grading, setGrading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [isFirstReview, setIsFirstReview] = useState(false)
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])
  const [scheduleSubjects, setScheduleSubjects] = useState<
    { id: string; name: string }[]
  >([])
  const [subjectFilter, setSubjectFilter] = useState<string>("")
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const sessionSeeded = useRef(false)

  const loadSchedule = useCallback(async (uid: string, subjectId?: string) => {
    setScheduleLoading(true)
    try {
      const params = new URLSearchParams({ user_id: uid })
      if (subjectId) params.set("subject_id", subjectId)
      const res = await fetch(`/api/erros/revisao/schedule?${params}`)
      const data = await res.json()
      if (res.ok) {
        setScheduleRows(data.rows ?? [])
        setScheduleSubjects(data.subjects ?? [])
      }
    } finally {
      setScheduleLoading(false)
    }
  }, [])

  const loadQueue = useCallback(
    async (uid: string) => {
      setLoading(true)
      setCheck(null)
      const res = await fetch(`/api/erros/revisao/queue?user_id=${uid}`)
      const data = await res.json()
      setLoading(false)
      if (!data.card) {
        setDone(true)
        setCard(null)
        setPreview(null)
        setOpenCount(0)
        setGenerating(Boolean(data.generating))
        void loadSchedule(uid, subjectFilter || undefined)
        return
      }
      const rem = Number(data.remaining ?? 0)
      const due = Number(data.total_due ?? rem + 1)
      const open = Math.max(1, rem + 1)
      setDone(false)
      setGenerating(false)
      setCard(data.card)
      setRemaining(rem)
      setOpenCount(open)
      setPreview(data.preview ?? null)
      setIsFirstReview(Boolean(data.card.is_first_review))
      if (!sessionSeeded.current) {
        sessionSeeded.current = true
        setSessionTotal(Math.max(due, open))
      } else {
        setSessionTotal((prev) => Math.max(prev, open))
      }
      void loadSchedule(uid, subjectFilter || undefined)
    },
    [loadSchedule, subjectFilter]
  )

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

  useEffect(() => {
    if (!userId) return
    void loadSchedule(userId, subjectFilter || undefined)
  }, [userId, subjectFilter, loadSchedule])

  useEffect(() => {
    if (!userId || !generating || card) return
    let cancelled = false
    void fetch("/api/erros/revisao/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    }).then(() => {
      if (!cancelled) loadQueue(userId)
    })
    const t = setInterval(() => {
      loadQueue(userId)
    }, 4000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [userId, generating, card, loadQueue])

  async function answerCe(selected: "Certo" | "Errado") {
    if (!userId || !card || checking) return
    setChecking(true)
    try {
      const res = await fetch("/api/erros/revisao/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          card_id: card.id,
          selected_answer: selected,
          check_only: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao conferir")
      setCheck(data)
      setPreview(data.preview ?? preview)
      setIsFirstReview(Boolean(data.is_first_review))
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Erro ao conferir")
    } finally {
      setChecking(false)
    }
  }

  async function grade(rating: number) {
    if (!userId || !card || !check || grading) return
    setGrading(true)
    try {
      const res = await fetch("/api/erros/revisao/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          card_id: card.id,
          selected_answer: check.selected,
          rating,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao agendar")
      await loadQueue(userId)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Erro ao agendar")
    } finally {
      setGrading(false)
    }
  }

  async function deleteErrorAndCard(opts: {
    errorId: string | null
    cardId: string
  }) {
    if (!userId || deleting) return
    const ok = confirm(
      "Excluir este erro e remover a assertiva da revisão? Isso não pode ser desfeito."
    )
    if (!ok) return
    setDeleting(true)
    try {
      if (opts.errorId) {
        const errRes = await fetch(`/api/errors/${opts.errorId}`, {
          method: "DELETE",
        })
        if (!errRes.ok) {
          const err = await errRes.json().catch(() => ({}))
          throw new Error(err.error || "Falha ao excluir erro")
        }
      }
      const cardRes = await fetch(
        `/api/flashcards/cards/${opts.cardId}?user_id=${userId}`,
        { method: "DELETE" }
      )
      if (!cardRes.ok) {
        const err = await cardRes.json().catch(() => ({}))
        throw new Error(err.error || "Falha ao remover assertiva")
      }
      await loadQueue(userId)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : "Erro ao excluir")
    } finally {
      setDeleting(false)
    }
  }

  const suggested = check?.suggested_rating ?? (check && !check.is_correct ? 1 : 3)
  const total = Math.max(sessionTotal, openCount, 1)
  const doneCount = Math.max(0, total - openCount)
  const progressPct = Math.min(100, Math.round((doneCount / total) * 100))
  const firstReview = isFirstReview || Boolean(card?.is_first_review)

  const scheduleTable = (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Agenda de erros</h2>
          <p className="text-xs text-slate-500">
            Criação, próxima revisão e filtro por matéria.
          </p>
        </div>
        <label className="text-xs text-slate-600">
          Matéria
          <select
            className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="">Todas</option>
            {scheduleSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {scheduleLoading ? (
        <p className="text-xs text-slate-500">Carregando agenda…</p>
      ) : scheduleRows.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma assertiva no deck ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-2 font-medium">Assertiva</th>
                <th className="py-2 pr-2 font-medium">Matéria</th>
                <th className="py-2 pr-2 font-medium">Criado</th>
                <th className="py-2 pr-2 font-medium">Próxima</th>
                <th className="py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {scheduleRows.map((row) => (
                <tr key={row.card_id} className="border-b border-slate-100">
                  <td className="max-w-[240px] py-2 pr-2 text-slate-800">
                    <p className="line-clamp-2">{row.statement_preview || "—"}</p>
                    {row.app_href && (
                      <Link
                        href={row.app_href}
                        className="mt-0.5 inline-block text-blue-600 hover:underline"
                        target="_blank"
                      >
                        Questão
                      </Link>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-slate-700">
                    {row.subject_name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2 text-slate-600">
                    {formatDt(row.created_at)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2 text-slate-600">
                    {formatDt(row.next_review_at)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() =>
                        void deleteErrorAndCard({
                          errorId: row.error_id,
                          cardId: row.card_id,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )

  if (loading && !card) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <p className="text-sm text-slate-600">Carregando revisão de erros…</p>
        {userId && scheduleTable}
      </div>
    )
  }

  if (done || !card) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Revisão de erros</h1>
          {generating ? (
            <p className="text-sm text-slate-600">
              Gerando assertiva C/E a partir dos seus erros recentes… Isso pode levar alguns
              segundos. A página atualiza automaticamente.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Não há assertivas pendentes agora. Veja a agenda abaixo.
            </p>
          )}
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/erros" className="text-blue-600 hover:underline">
              Caderno de erros
            </Link>
            <Link
              href="/configuracoes?tab=erros"
              className="text-blue-600 hover:underline"
            >
              Configurar FSRS
            </Link>
            {generating && userId && (
              <button
                type="button"
                className="text-blue-600 hover:underline"
                onClick={() => loadQueue(userId)}
              >
                Atualizar agora
              </button>
            )}
          </div>
        </div>
        {scheduleTable}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Revisão de erros</h1>
          <p className="mt-1 text-xs text-slate-500">
            {openCount} em aberto
            {remaining > 0 ? ` · ${remaining} depois desta` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <Link href="/erros" className="text-slate-600 hover:underline">
            Caderno
          </Link>
          <Link
            href="/configuracoes?tab=erros"
            className="text-xs text-slate-500 hover:underline"
          >
            Configurar FSRS
          </Link>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-600">
          <span>
            Progresso da sessão · {doneCount}/{total}
          </span>
          <span className="tabular-nums">{progressPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium">Veio de um erro</div>
            {card.subject_name ? (
              <p className="mt-0.5 text-amber-900/90">Matéria: {card.subject_name}</p>
            ) : null}
            {card.recurrence_count && card.recurrence_count > 1 ? (
              <p className="mt-0.5 opacity-80">{card.recurrence_count}× no caderno</p>
            ) : null}
            <OriginLinks origin={card.origin} />
          </div>
          <button
            type="button"
            disabled={deleting}
            onClick={() =>
              void deleteErrorAndCard({
                errorId: card.error_id,
                cardId: card.id,
              })
            }
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            title="Excluir erro"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? "…" : "Excluir"}
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Assertiva (certo ou errado)
        </p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
          {card.statement}
        </p>

        {!check ? (
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              disabled={checking}
              onClick={() => answerCe("Certo")}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Certo
            </button>
            <button
              type="button"
              disabled={checking}
              onClick={() => answerCe("Errado")}
              className="flex-1 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Errado
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div
              className={`rounded-lg p-4 text-sm ${
                check.is_correct
                  ? "bg-emerald-50 text-emerald-900"
                  : "bg-rose-50 text-rose-900"
              }`}
            >
              {check.is_correct ? "Você acertou." : "Você errou."} Gabarito:{" "}
              <strong>{check.correct_answer}</strong>
            </div>
            {check.explanation && (
              <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-800">
                <p className="mb-1 text-xs font-semibold text-slate-600">Explicação</p>
                <p className="whitespace-pre-wrap leading-relaxed">{check.explanation}</p>
              </div>
            )}
            <OriginLinks origin={card.origin} />

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Quão bem você lembrou?
              </p>
              {firstReview && (
                <p className="mb-2 text-xs text-slate-600">
                  1ª revisão: Hard = 1 dia · Good = 3 dias · Easy = 7 dias (Again refaz agora).
                  Depois entra o FSRS normal.
                </p>
              )}
              {!check.is_correct && (
                <p className="mb-2 text-xs text-amber-800">
                  Como errou o C/E, sugerimos <strong>Again</strong> — ainda pode escolher
                  outra nota.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["again", 1, preview?.again],
                    ["hard", 2, preview?.hard],
                    ["good", 3, preview?.good],
                    ["easy", 4, preview?.easy],
                  ] as const
                ).map(([, rating, interval]) => {
                  const highlight = rating === suggested
                  return (
                    <button
                      key={rating}
                      type="button"
                      disabled={grading}
                      title={RATING_HELP[rating].title}
                      onClick={() => grade(rating)}
                      className={`rounded-lg border py-3 text-sm disabled:opacity-50 ${
                        highlight
                          ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block font-medium">
                        {RATING_HELP[rating].label}
                      </span>
                      {interval && (
                        <span className="text-xs text-slate-500">{interval}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {scheduleTable}
    </div>
  )
}
