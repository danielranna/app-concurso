"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Plus } from "lucide-react"

type Card = {
  id: string
  type: string
  front_text: string | null
  cloze_text: string | null
  flashcard_states?: { due_at: string }[]
}

export default function DeckDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [deckName, setDeckName] = useState("")
  const [cards, setCards] = useState<Card[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/flashcards/cards?user_id=${user.id}&deck_id=${id}`)
        .then((r) => r.json())
        .then((data) => {
          setCards(data ?? [])
          const name = data?.[0]?.flashcard_decks?.name
          if (name) setDeckName(name)
        })
      fetch(`/api/flashcards/decks?user_id=${user.id}`)
        .then((r) => r.json())
        .then((decks: { id: string; name: string }[]) => {
          const d = decks.find((x) => x.id === id)
          if (d) setDeckName(d.name)
        })
    })
  }, [id, router])

  if (!userId) return null

  return (
    <main className="px-6 py-6">
      <Link href="/flashcards" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">{deckName || "Baralho"}</h1>
        <Link
          href={`/flashcards/cards/new?deck_id=${id}`}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-white"
        >
          <Plus className="h-4 w-4" />
          Novo card
        </Link>
      </header>

      <ul className="space-y-2">
        {cards.map((c) => (
          <li key={c.id}>
            <Link
              href={`/flashcards/cards/${c.id}/edit`}
              className="block rounded-lg border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50"
            >
              <span className="text-xs uppercase text-slate-400">{c.type}</span>
              <p className="mt-1 text-slate-800 line-clamp-2">
                {c.front_text || c.cloze_text?.replace(/\{\{c\d+::/g, "").replace(/\}\}/g, "") || "(imagem)"}
              </p>
              {c.flashcard_states?.[0] && (
                <p className="mt-1 text-xs text-slate-500">
                  Próxima revisão: {new Date(c.flashcard_states[0].due_at).toLocaleString("pt-BR")}
                </p>
              )}
            </Link>
          </li>
        ))}
        {cards.length === 0 && <p className="text-slate-500">Nenhum card neste baralho.</p>}
      </ul>
    </main>
  )
}
