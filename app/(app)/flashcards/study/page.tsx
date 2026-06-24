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

const RATING_HELP: Record<number, { label: string; title: string }> = {
  1: {
    label: "Again",
    title: "Errei — o card volta aos passos de aprendizado (1 min) e reaparece no fim da sessão.",
  },
  2: {
    label: "Hard",
    title: "Lembrei com dificuldade — intervalo menor que Good; repete antes.",
  },
  3: {
    label: "Good",
    title: "Lembrei — intervalo padrão FSRS (não é o SM-2 antigo do Anki).",
  },
  4: {
    label: "Easy",
    title: "Muito fácil — intervalo bem maior; use só quando for trivial.",
  },
}

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
  const [deferredCardIds, setDeferredCardIds] = useState<string[]>([])

  const loadQueue = useCallback(
    async (uid: string, deferIds?: string[]) => {
      setLoading(true)
      setRevealed(false)
      const params = new URLSearchParams({ user_id: uid })
      if (deckId) params.set("deck_id", deckId)
      if (subjectId) params.set("subject_id", subjectId)
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
      setRemaining(data.remaining)
    },
    [deckId, subjectId, deferredCardIds]
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

  async function answer(rating: number) {
    if (!userId || !card) return
    let nextDeferred = deferredCardIds
    if (rating === 1 && !deferredCardIds.includes(card.id)) {
      nextDeferred = [...deferredCardIds, card.id]
      setDeferredCardIds(nextDeferred)
    }
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
    loadQueue(userId, nextDeferred)
  }

  if (!userId) return null

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
            <>
              <p className="mb-3 text-xs text-slate-500">
                FSRS agenda a próxima revisão pela dificuldade do card. Intervalos menores =
                mais repetições. Passe o mouse nos botões para dicas.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["again", 1, preview?.again],
                    ["hard", 2, preview?.hard],
                    ["good", 3, preview?.good],
                    ["easy", 4, preview?.easy],
                  ] as const
                ).map(([, rating, interval]) => (
                  <button
                    key={rating}
                    type="button"
                    title={RATING_HELP[rating].title}
                    onClick={() => answer(rating)}
                    className="rounded-lg border border-slate-200 py-3 text-sm hover:bg-slate-50"
                  >
                    <span className="block font-medium">{RATING_HELP[rating].label}</span>
                    {interval && <span className="text-xs text-slate-500">{interval}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </main>
  )
}
