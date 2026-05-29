"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import FlashcardImage from "@/components/flashcards/FlashcardImage"

type StudyCard = {
  id: string
  type: string
  deck_name?: string
  front: { text: string | null; image_url: string | null }
  back: { text: string | null; image_url: string | null }
}

type Preview = { again: string; hard: string; good: string; easy: string }

type Props = {
  userId: string
}

export default function HomeFlashcardWidget({ userId }: Props) {
  const [dueTotal, setDueTotal] = useState(0)
  const [card, setCard] = useState<StudyCard | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [deferredCardIds, setDeferredCardIds] = useState<string[]>([])

  const loadQueue = useCallback(
    async (deferIds?: string[]) => {
      setLoading(true)
      setRevealed(false)
      const panelRes = await fetch(
        `/api/flashcards/panel?user_id=${userId}&filter=due_today`
      )
      const panel = await panelRes.json()
      const totalDue =
        (panel.subjects ?? []).reduce(
          (acc: number, s: { due_today: number }) => acc + (s.due_today ?? 0),
          0
        ) + (panel.orphan?.due_today ?? 0)
      setDueTotal(totalDue)

      const params = new URLSearchParams({ user_id: userId })
      const defer = deferIds ?? deferredCardIds
      if (defer.length) params.set("defer_card_ids", defer.join(","))
      const res = await fetch(`/api/flashcards/study/queue?${params}`)
      const data = await res.json()
      setLoading(false)
      if (!data.card) {
        setDone(true)
        setCard(null)
        return
      }
      setDone(false)
      setCard(data.card)
      setPreview(data.preview)
      setRemaining(data.remaining ?? 0)
    },
    [userId, deferredCardIds]
  )

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  async function answer(rating: number) {
    if (!card) return
    let nextDeferred = deferredCardIds
    if (rating === 1 && !deferredCardIds.includes(card.id)) {
      nextDeferred = [...deferredCardIds, card.id]
      setDeferredCardIds(nextDeferred)
    }
    await fetch("/api/flashcards/study/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, card_id: card.id, rating }),
    })
    loadQueue(nextDeferred)
  }

  const display = revealed && card ? card.back : card?.front

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Flashcards</h2>
          <p className="text-sm text-slate-500">
            {dueTotal > 0
              ? `${dueTotal} para revisar hoje`
              : "Nada pendente para hoje"}
          </p>
        </div>
        <Link
          href="/flashcards/study"
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          Estudo completo →
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : done ? (
        <p className="rounded-lg bg-slate-50 py-6 text-center text-sm text-slate-600">
          Fila vazia por agora. Volte mais tarde ou revise em{" "}
          <Link href="/flashcards" className="font-medium text-emerald-700 hover:underline">
            Flashcards
          </Link>
          .
        </p>
      ) : card && display ? (
        <div>
          {card.deck_name && (
            <p className="mb-1 text-xs text-slate-400">{card.deck_name}</p>
          )}
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            {display.image_url ? (
              <FlashcardImage src={display.image_url} variant="study" />
            ) : (
              <div
                className="prose prose-sm prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: display.text ?? "" }}
              />
            )}
          </div>

          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white"
            >
              Mostrar resposta
            </button>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["Again", 1, preview?.again],
                  ["Hard", 2, preview?.hard],
                  ["Good", 3, preview?.good],
                  ["Easy", 4, preview?.easy],
                ] as const
              ).map(([label, rating, interval]) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => answer(rating)}
                  className="rounded-lg border border-slate-200 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="block font-medium">{label}</span>
                  {interval && <span className="text-xs text-slate-500">{interval}</span>}
                </button>
              ))}
            </div>
          )}

          {remaining > 0 && (
            <p className="mt-2 text-center text-xs text-slate-400">
              +{remaining} na fila após este
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}
