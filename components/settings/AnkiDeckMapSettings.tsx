"use client"

import { useCallback, useEffect, useState } from "react"

type DeckLink = { deck_name: string; subject_id: string }
type Subject = { id: string; name: string }

export default function AnkiDeckMapSettings({ userId }: { userId: string }) {
  const [decks, setDecks] = useState<DeckLink[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    const [deckRes, subjectRes] = await Promise.all([
      fetch(`/api/extension/anki/decks?user_id=${userId}`),
      fetch(`/api/subjects?user_id=${userId}`),
    ])
    const deckData = await deckRes.json().catch(() => ({}))
    const subjectData = await subjectRes.json().catch(() => [])
    setReady(deckData.ready !== false)
    const nextDecks = Array.isArray(deckData.decks) ? (deckData.decks as DeckLink[]) : []
    nextDecks.sort((a, b) => a.deck_name.localeCompare(b.deck_name, "pt-BR", { sensitivity: "base" }))
    setDecks(nextDecks)
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
  }, [userId])

  useEffect(() => {
    let cancel = false
    load().catch(() => {
      if (!cancel) setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [load])

  async function refreshFromAnki() {
    setRefreshing(true)
    setMessage("")
    const requestId = `${Date.now()}`
    const reply = await new Promise<{ ok?: boolean; error?: string } | null>((resolve) => {
      function onMessage(event: MessageEvent) {
        if (event.source !== window) return
        const data = event.data
        if (!data || data.source !== "tec-extension" || data.type !== "anki-decks-refreshed") return
        if (data.requestId !== requestId) return
        window.removeEventListener("message", onMessage)
        resolve(data)
      }
      window.addEventListener("message", onMessage)
      window.setTimeout(() => {
        window.removeEventListener("message", onMessage)
        resolve(null)
      }, 60000)
      window.postMessage(
        { source: "tec-app", type: "refresh-anki-decks", requestId },
        window.location.origin
      )
    })
    await load()
    if (!reply) {
      setMessage("A extensão não respondeu. Recarregue ela em chrome://extensions e deixe o Anki aberto.")
    } else if (!reply.ok) {
      setMessage(reply.error || "Não atualizei os baralhos.")
    } else {
      setMessage("Baralhos atualizados.")
    }
    setRefreshing(false)
  }

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
    const nextDecks = Array.isArray(data.decks) ? (data.decks as DeckLink[]) : []
    nextDecks.sort((a, b) => a.deck_name.localeCompare(b.deck_name, "pt-BR", { sensitivity: "base" }))
    setDecks(nextDecks)
    setMessage("Associação salva.")
  }

  const used = new Set(decks.map((row) => row.subject_id).filter(Boolean))
  const freeSubjects = subjects.filter((subject) => !used.has(subject.id))

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Baralhos e matérias</h2>
          <p className="mt-1 text-sm text-slate-500">
            Associe uma vez. Vale para o flashcard e para o mapa de erros. Card novo num baralho ligado entra na matéria, no tema Anki.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshFromAnki}
          disabled={refreshing || loading}
          className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {refreshing ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Lendo baralhos…</p>
      ) : !ready || decks.length === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
          Ainda não há baralhos aqui. Abra o Anki neste computador e clique em Atualizar.
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
