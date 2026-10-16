"use client"

import { useEffect, useState } from "react"

type DeckLink = { deck_name: string; subject_id: string }
type Subject = { id: string; name: string }

export default function AnkiDeckMapSettings({ userId }: { userId: string }) {
  const [decks, setDecks] = useState<DeckLink[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancel = false
    Promise.all([
      fetch(`/api/extension/anki/decks?user_id=${userId}`).then((res) => res.json()),
      fetch(`/api/subjects?user_id=${userId}`).then((res) => res.json()),
    ]).then(([deckData, subjectData]) => {
      if (cancel) return
      setReady(deckData.ready !== false)
      setDecks(Array.isArray(deckData.decks) ? deckData.decks : [])
      const rows = Array.isArray(subjectData) ? subjectData : []
      setSubjects(
        rows
          .map((row: { id?: string; name?: string }) => ({
            id: String(row.id || ""),
            name: String(row.name || ""),
          }))
          .filter((row: Subject) => row.id && row.name)
          .sort((a: Subject, b: Subject) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
      )
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [userId])

  async function save(deckName: string, subjectId: string) {
    setMessage("")
    setDecks((current) =>
      current.map((row) => (row.deck_name === deckName ? { ...row, subject_id: subjectId } : row))
    )
    const res = await fetch("/api/extension/anki/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        deck_name: deckName,
        subject_id: subjectId || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(data.error || "Não salvei a associação.")
      return
    }
    setDecks(Array.isArray(data.decks) ? data.decks : [])
    setMessage("Associação salva.")
  }

  const used = new Set(decks.map((row) => row.subject_id).filter(Boolean))
  const freeSubjects = subjects.filter((subject) => !used.has(subject.id))

  if (loading) return <p className="mb-6 text-sm text-slate-500">Lendo baralhos…</p>

  return (
    <section className="mb-8 border-b border-slate-100 pb-8">
      <h2 className="text-base font-semibold text-slate-900">Baralhos do Anki</h2>
      <p className="mt-1 text-sm text-slate-500">
        Associe uma vez. Card novo num baralho ligado entra na matéria correspondente, no tema Anki.
      </p>
      {!ready || decks.length === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
          Ainda não há baralhos aqui. Abra o Anki neste computador, com a extensão, e atualize esta página.
          {!ready ? " Rode também o SQL da associação de baralhos." : ""}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-semibold">Baralho do Anki</th>
                <th className="py-2 font-semibold">Matéria</th>
              </tr>
            </thead>
            <tbody>
              {decks.map((deck) => (
                <tr key={deck.deck_name} className="border-b border-slate-100">
                  <td className="py-2 pr-3 text-slate-800">{deck.deck_name}</td>
                  <td className="py-2">
                    <select
                      value={deck.subject_id}
                      onChange={(event) => save(deck.deck_name, event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="">Não associar</option>
                      {subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {freeSubjects.length > 0 && decks.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Matérias sem baralho: {freeSubjects.map((subject) => subject.name).join(", ")}.
        </p>
      )}
      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
    </section>
  )
}
