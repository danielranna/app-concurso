"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Plus, Play, Settings } from "lucide-react"

type Deck = { id: string; name: string; created_at: string }

export default function FlashcardsHomePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [decks, setDecks] = useState<Deck[]>([])
  const [newDeckName, setNewDeckName] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/flashcards/decks?user_id=${user.id}`)
        .then((r) => r.json())
        .then(setDecks)
    })
  }, [router])

  async function createDeck() {
    if (!userId || !newDeckName.trim()) return
    const res = await fetch("/api/flashcards/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, name: newDeckName.trim() }),
    })
    const deck = await res.json()
    setDecks((d) => [...d, deck])
    setNewDeckName("")
  }

  if (!userId) return null

  return (
    <main className="px-6 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Flashcards</h1>
        <div className="flex gap-2">
          <Link
            href="/flashcards/study"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
          >
            <Play className="h-4 w-4" />
            Estudar
          </Link>
          <Link
            href="/flashcards/settings"
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-100"
          >
            <Settings className="h-4 w-4" />
            Configurações
          </Link>
        </div>
      </header>

      <div className="mb-6 flex gap-2">
        <input
          value={newDeckName}
          onChange={(e) => setNewDeckName(e.target.value)}
          placeholder="Nome do baralho"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={createDeck}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
        >
          <Plus className="h-4 w-4" />
          Novo baralho
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((deck) => (
          <Link
            key={deck.id}
            href={`/flashcards/decks/${deck.id}`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400"
          >
            <h2 className="font-semibold text-slate-800">{deck.name}</h2>
            <p className="mt-1 text-sm text-slate-500">Ver e editar cards</p>
          </Link>
        ))}
        {decks.length === 0 && (
          <p className="text-slate-500">Crie um baralho para começar.</p>
        )}
      </div>
    </main>
  )
}
