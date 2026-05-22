"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import FlashcardImage from "@/components/flashcards/FlashcardImage"

type StudyCard = {
  id: string
  type: string
  deck_name?: string
  front: { text: string | null; image_url: string | null }
  back: { text: string | null; image_url: string | null }
}

type Preview = { again: string; hard: string; good: string; easy: string }

export default function StudyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const deckId = searchParams.get("deck_id")
  const subjectId = searchParams.get("subject_id")

  const [userId, setUserId] = useState<string | null>(null)
  const [card, setCard] = useState<StudyCard | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [waitingUntil, setWaitingUntil] = useState<string | null>(null)
  const [laterCount, setLaterCount] = useState(0)

  const loadQueue = useCallback(async (uid: string, silent = false) => {
    if (!silent) setLoading(true)
    setRevealed(false)
    const params = new URLSearchParams({ user_id: uid })
    if (deckId) params.set("deck_id", deckId)
    if (subjectId) params.set("subject_id", subjectId)
    const res = await fetch(`/api/flashcards/study/queue?${params}`)
    const data = await res.json()
    if (!silent) setLoading(false)
    if (!data.card) {
      if (data.later_count > 0 && data.next_due_at) {
        setDone(false)
        setCard(null)
        setWaitingUntil(data.next_due_at)
        setLaterCount(data.later_count)
        return
      }
      setWaitingUntil(null)
      setLaterCount(0)
      setDone(true)
      setCard(null)
      return
    }
    setDone(false)
    setWaitingUntil(null)
    setLaterCount(0)
    setCard(data.card)
    setPreview(data.preview)
    setRemaining(data.remaining)
  }, [deckId, subjectId])

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
    if (!userId || !waitingUntil) return
    const poll = () => loadQueue(userId, true)
    const id = setInterval(poll, 15000)
    return () => clearInterval(id)
  }, [userId, waitingUntil, loadQueue])

  function formatWaitLabel(iso: string) {
    const ms = new Date(iso).getTime() - Date.now()
    if (ms <= 0) return "em instantes"
    const mins = Math.ceil(ms / 60000)
    if (mins < 60) return `em ~${mins} min`
    const hours = Math.ceil(ms / 3600000)
    return `em ~${hours} h`
  }

  async function answer(rating: number) {
    if (!userId || !card) return
    await fetch("/api/flashcards/study/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        card_id: card.id,
        rating,
        deck_id: deckId,
      }),
    })
    loadQueue(userId)
  }

  if (!userId) return null

  if (waitingUntil && !card) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-xl font-semibold text-slate-800">Pausa entre revisões</p>
        <p className="mt-2 text-slate-600">
          Próximo card {formatWaitLabel(waitingUntil)}
          {laterCount > 1 ? ` (+${laterCount - 1} depois)` : ""}
        </p>
        <p className="mt-4 text-sm text-slate-500">A fila atualiza sozinha. Você pode sair e voltar depois.</p>
        <Link href="/flashcards" className="mt-6 text-emerald-600 hover:underline">
          Voltar aos baralhos
        </Link>
      </main>
    )
  }

  if (done) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6">
        <p className="text-xl font-semibold text-slate-800">Parabéns! Fila vazia por hoje.</p>
        <Link href="/flashcards" className="mt-4 text-emerald-600 hover:underline">
          Voltar aos baralhos
        </Link>
      </main>
    )
  }

  const display = revealed && card ? card.back : card?.front

  return (
    <main className={`mx-auto px-6 py-8 ${card?.type === "cloze_image" ? "max-w-5xl" : "max-w-2xl"}`}>
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
        <Link href="/flashcards">← Sair</Link>
        <span>{remaining > 0 ? `+${remaining} na fila` : "último"}</span>
      </div>

      {loading ? (
        <p className="text-center text-slate-500">Carregando...</p>
      ) : card && display ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {card.deck_name && (
            <p className="mb-2 text-xs text-slate-400">{card.deck_name}</p>
          )}
          {display.image_url ? (
            <FlashcardImage src={display.image_url} variant="study" />
          ) : (
            <div
              className="prose prose-slate max-w-none text-lg"
              dangerouslySetInnerHTML={{ __html: display.text ?? "" }}
            />
          )}

          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="mt-8 w-full rounded-lg bg-slate-900 py-3 text-white"
            >
              Mostrar resposta
            </button>
          ) : (
            <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                  onClick={() => answer(rating)}
                  className="rounded-lg border border-slate-200 py-3 text-sm hover:bg-slate-50"
                >
                  <span className="block font-medium">{label}</span>
                  {interval && <span className="text-xs text-slate-500">{interval}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </main>
  )
}
