"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { LayoutGrid, Play, Plus, Settings } from "lucide-react"

type SubjectSummary = {
  id: string
  name: string
  due_today: number
  overdue: number
  card_count: number
}

type DeckOption = { id: string; name: string; subject_id: string | null }

export default function FlashcardsHomePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<SubjectSummary[]>([])
  const [decks, setDecks] = useState<DeckOption[]>([])
  const [uncategorized, setUncategorized] = useState({
    due_today: 0,
    overdue: 0,
    card_count: 0,
  })
  const [totalDueToday, setTotalDueToday] = useState(0)
  const [pickDeckOpen, setPickDeckOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      Promise.all([
        fetch(`/api/flashcards/panel?user_id=${user.id}&filter=all`).then((r) => r.json()),
        fetch(`/api/flashcards/decks?user_id=${user.id}`).then((r) => r.json()),
      ]).then(([panel, deckList]) => {
        setSubjects(
          (panel.subjects ?? []).map(
            (s: {
              id: string
              name: string
              due_today: number
              overdue: number
              card_count: number
            }) => ({
              id: s.id,
              name: s.name,
              due_today: s.due_today,
              overdue: s.overdue,
              card_count: s.card_count,
            })
          )
        )
        const unc = (panel.uncategorized_decks ?? []) as {
          due_today: number
          overdue: number
          card_count: number
        }[]
        setUncategorized({
          due_today: unc.reduce((n, d) => n + d.due_today, 0),
          overdue: unc.reduce((n, d) => n + d.overdue, 0),
          card_count: unc.reduce((n, d) => n + d.card_count, 0),
        })
        setTotalDueToday(panel.totals?.due_today ?? 0)
        setDecks(deckList ?? [])
      })
    })
  }, [router])

  function goNewCard(deckId: string) {
    router.push(`/flashcards/cards/new?deck_id=${deckId}`)
  }

  if (!userId) return null

  const subjectNameById = Object.fromEntries(subjects.map((s) => [s.id, s.name]))

  return (
    <main className="px-6 py-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Flashcards</h1>
          {totalDueToday > 0 && (
            <p className="mt-1 text-sm text-emerald-700">
              {totalDueToday} para revisar hoje
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (decks.length === 1) goNewCard(decks[0].id)
              else setPickDeckOpen(true)
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-800 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Novo card
          </button>
          <Link
            href="/flashcards/study"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
          >
            <Play className="h-4 w-4" />
            Estudar
          </Link>
          <Link
            href="/flashcards/panel"
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-800 hover:bg-slate-50"
          >
            <LayoutGrid className="h-4 w-4" />
            Abrir painel
          </Link>
          <Link
            href="/flashcards/settings"
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-100"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Matérias</h2>

        {subjects.length === 0 && uncategorized.card_count === 0 ? (
          <p className="text-slate-500">
            Crie matérias em Erros ou baralhos no{" "}
            <Link href="/flashcards/panel" className="text-emerald-600 hover:underline">
              painel
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => (
              <Link
                key={s.id}
                href={`/flashcards/panel?subject_id=${s.id}`}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <p className="font-semibold text-slate-800">{s.name}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {s.card_count} card{s.card_count !== 1 ? "s" : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {s.due_today > 0 && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
                      {s.due_today} hoje
                    </span>
                  )}
                  {s.overdue > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                      {s.overdue} atrasado{s.overdue > 1 ? "s" : ""}
                    </span>
                  )}
                  {s.due_today === 0 && s.overdue === 0 && (
                    <span className="text-slate-400">Em dia</span>
                  )}
                </div>
              </Link>
            ))}

            {uncategorized.card_count > 0 && (
              <Link
                href="/flashcards/panel"
                className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 hover:bg-slate-100"
              >
                <p className="font-semibold text-slate-700">Sem matéria</p>
                <p className="mt-2 text-sm text-slate-600">{uncategorized.card_count} cards</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {uncategorized.due_today > 0 && (
                    <span className="text-emerald-700">{uncategorized.due_today} hoje</span>
                  )}
                  {uncategorized.overdue > 0 && (
                    <span className="text-amber-700">{uncategorized.overdue} atrasados</span>
                  )}
                </div>
              </Link>
            )}
          </div>
        )}
      </section>

      {pickDeckOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-slate-800">Escolha o baralho</h3>
            {decks.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Crie um baralho no{" "}
                <Link href="/flashcards/panel" className="text-emerald-600 hover:underline">
                  painel
                </Link>{" "}
                primeiro.
              </p>
            ) : (
              <ul className="mt-3 space-y-1">
                {decks.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => goNewCard(d.id)}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"
                    >
                      <span className="font-medium text-slate-800">{d.name}</span>
                      {d.subject_id && (
                        <span className="ml-2 text-xs text-slate-500">
                          {subjectNameById[d.subject_id]}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setPickDeckOpen(false)}
              className="mt-4 w-full rounded-lg border py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
