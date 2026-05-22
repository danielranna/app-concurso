"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Calendar, Plus, Play, Settings } from "lucide-react"

type DeckOverview = {
  id: string
  name: string
  card_count: number
  due_today: number
  overdue_count: number
  next_review_at: string | null
  upcoming: {
    id: string
    preview: string
    due_at: string
    is_overdue: boolean
    is_due_today: boolean
  }[]
}

function formatDue(dateStr: string | null) {
  if (!dateStr) return "Sem revisões agendadas"
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  if (d < now) {
    return `Atrasado — ${d.toLocaleDateString("pt-BR")} ${time}`
  }
  if (isToday) return `Hoje às ${time}`
  return d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function FlashcardsHomePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [decks, setDecks] = useState<DeckOverview[]>([])
  const [newDeckName, setNewDeckName] = useState("")

  function loadOverview(uid: string) {
    fetch(`/api/flashcards/decks/overview?user_id=${uid}`)
      .then((r) => r.json())
      .then((data) => setDecks(data.decks ?? []))
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      loadOverview(user.id)
    })
  }, [router])

  async function createDeck() {
    if (!userId || !newDeckName.trim()) return
    await fetch("/api/flashcards/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, name: newDeckName.trim() }),
    })
    setNewDeckName("")
    loadOverview(userId)
  }

  if (!userId) return null

  const totalDueToday = decks.reduce((s, d) => s + d.due_today, 0)

  return (
    <main className="px-6 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Flashcards</h1>
          {totalDueToday > 0 && (
            <p className="mt-1 text-sm text-emerald-700">
              {totalDueToday} card{totalDueToday > 1 ? "s" : ""} para revisar hoje
            </p>
          )}
        </div>
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

      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Painel de baralhos</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Próxima repetição de cada baralho e cards agendados.
        </p>

        {decks.length === 0 ? (
          <p className="text-slate-500">Crie um baralho para começar.</p>
        ) : (
          <div className="space-y-4">
            {decks.map((deck) => (
              <div
                key={deck.id}
                className="rounded-lg border border-slate-100 bg-slate-50/80 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/flashcards/decks/${deck.id}`}
                      className="text-lg font-semibold text-slate-800 hover:text-emerald-700"
                    >
                      {deck.name}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      {deck.card_count} card{deck.card_count !== 1 ? "s" : ""}
                      {deck.due_today > 0 && (
                        <span className="ml-2 font-medium text-emerald-700">
                          · {deck.due_today} hoje
                        </span>
                      )}
                      {deck.overdue_count > 0 && (
                        <span className="ml-2 font-medium text-amber-700">
                          · {deck.overdue_count} atrasado{deck.overdue_count > 1 ? "s" : ""}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Próxima repetição
                    </p>
                    <p
                      className={`mt-0.5 text-sm font-medium ${
                        deck.overdue_count > 0
                          ? "text-amber-700"
                          : deck.due_today > 0
                            ? "text-emerald-700"
                            : "text-slate-700"
                      }`}
                    >
                      {formatDue(deck.next_review_at)}
                    </p>
                    {deck.due_today > 0 && (
                      <Link
                        href={`/flashcards/study?deck_id=${deck.id}`}
                        className="mt-2 inline-block text-xs text-emerald-600 hover:underline"
                      >
                        Estudar este baralho
                      </Link>
                    )}
                  </div>
                </div>

                {deck.upcoming.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-slate-200 pt-3">
                    {deck.upcoming.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate text-slate-700 max-w-[60%]">{c.preview}</span>
                        <span
                          className={`shrink-0 text-xs ${
                            c.is_overdue
                              ? "text-amber-700"
                              : c.is_due_today
                                ? "text-emerald-700"
                                : "text-slate-500"
                          }`}
                        >
                          {formatDue(c.due_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mb-4 flex gap-2">
        <input
          value={newDeckName}
          onChange={(e) => setNewDeckName(e.target.value)}
          placeholder="Nome do baralho"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          onKeyDown={(e) => e.key === "Enter" && createDeck()}
        />
        <button
          onClick={createDeck}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
        >
          <Plus className="h-4 w-4" />
          Novo baralho
        </button>
      </div>
    </main>
  )
}
