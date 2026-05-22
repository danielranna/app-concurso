"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function EditCardPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [deckId, setDeckId] = useState("")
  const [type, setType] = useState("")
  const [frontText, setFrontText] = useState("")
  const [backText, setBackText] = useState("")
  const [clozeText, setClozeText] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      const res = await fetch(`/api/flashcards/cards/${id}`)
      const card = await res.json()
      setDeckId(card.deck_id)
      setType(card.type)
      setFrontText(card.front_text ?? "")
      setBackText(card.back_text ?? "")
      setClozeText(card.cloze_text ?? "")
    })
  }, [id, router])

  async function save() {
    if (!userId) return
    const body: Record<string, unknown> = { user_id: userId }
    if (type === "basic") {
      body.front_text = frontText
      body.back_text = backText
    } else if (type === "cloze_text") {
      body.cloze_text = clozeText
    }
    await fetch(`/api/flashcards/cards/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    router.push(`/flashcards/decks/${deckId}`)
  }

  if (!userId) return null

  return (
    <main className="mx-auto max-w-2xl px-6 py-6">
      <h1 className="text-2xl font-semibold">Editar card</h1>
      <div className="mt-4 space-y-4">
        {type === "basic" && (
          <>
            <textarea
              value={frontText}
              onChange={(e) => setFrontText(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              rows={4}
              placeholder="Frente"
            />
            <textarea
              value={backText}
              onChange={(e) => setBackText(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              rows={4}
              placeholder="Verso"
            />
          </>
        )}
        {type === "cloze_text" && (
          <textarea
            value={clozeText}
            onChange={(e) => setClozeText(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
            rows={8}
          />
        )}
        {type === "cloze_image" && (
          <p className="text-sm text-slate-500">Edição de máscaras: recrie o card se necessário.</p>
        )}
        <button onClick={save} className="rounded-lg bg-slate-900 px-6 py-2 text-white">
          Salvar
        </button>
        <Link href={`/flashcards/decks/${deckId}`} className="ml-4 text-sm text-slate-600">
          Cancelar
        </Link>
      </div>
    </main>
  )
}
