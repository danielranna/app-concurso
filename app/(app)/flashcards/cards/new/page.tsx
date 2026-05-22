"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ImageMaskEditor from "@/components/flashcards/ImageMaskEditor"
import { nextClozeIndex, wrapClozeSelection } from "@/lib/flashcard-content"
import type { FlashcardType, ImageMask } from "@/lib/flashcard-types"

export default function NewCardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const deckId = searchParams.get("deck_id") ?? ""

  const [userId, setUserId] = useState<string | null>(null)
  const [type, setType] = useState<FlashcardType>("basic")
  const [frontText, setFrontText] = useState("")
  const [backText, setBackText] = useState("")
  const [clozeText, setClozeText] = useState("")
  const clozeRef = useRef<HTMLTextAreaElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [occludedUrl, setOccludedUrl] = useState<string | null>(null)
  const [masks, setMasks] = useState<ImageMask[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/login")
      else setUserId(user.id)
    })
  }, [router])

  function wrapCloze() {
    const el = clozeRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    if (start === end) return
    const sel = clozeText.slice(start, end)
    const idx = nextClozeIndex(clozeText)
    const next = wrapClozeSelection(clozeText, sel, idx)
    setClozeText(next)
  }

  async function uploadImage(file: File) {
    if (!userId) return
    const fd = new FormData()
    fd.append("user_id", userId)
    fd.append("file", file)
    if (masks.length) fd.append("masks", JSON.stringify(masks))
    const res = await fetch("/api/flashcards/cards/upload", { method: "POST", body: fd })
    const data = await res.json()
    setImageUrl(data.image_url)
    setOccludedUrl(data.image_occluded_url)
    setMasks(data.image_masks ?? [])
  }

  async function save() {
    if (!userId || !deckId) return
    setSaving(true)
    const body: Record<string, unknown> = {
      user_id: userId,
      deck_id: deckId,
      type,
    }
    if (type === "basic") {
      body.front_text = frontText
      body.back_text = backText
    } else if (type === "cloze_text") {
      body.cloze_text = clozeText
    } else {
      body.image_url = imageUrl
      body.image_occluded_url = occludedUrl ?? imageUrl
      body.image_masks = masks
    }

    const res = await fetch("/api/flashcards/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const card = await res.json()
    setSaving(false)
    if (card.id) router.push(`/flashcards/decks/${deckId}`)
  }

  if (!userId) return null

  return (
    <main className="mx-auto max-w-2xl px-6 py-6">
      <Link href={`/flashcards/decks/${deckId}`} className="text-sm text-slate-600 hover:underline">
        ← Voltar
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Novo card</h1>

      <div className="mt-4 flex gap-2">
        {(["basic", "cloze_text", "cloze_image"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-lg px-3 py-1 text-sm ${
              type === t ? "bg-slate-900 text-white" : "border border-slate-300"
            }`}
          >
            {t === "basic" ? "Normal" : t === "cloze_text" ? "Oclusão texto" : "Oclusão imagem"}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {type === "basic" && (
          <>
            <div>
              <label className="text-sm font-medium">Frente</label>
              <textarea
                value={frontText}
                onChange={(e) => setFrontText(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                rows={4}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Verso</label>
              <textarea
                value={backText}
                onChange={(e) => setBackText(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                rows={4}
              />
            </div>
          </>
        )}

        {type === "cloze_text" && (
          <div>
            <label className="text-sm font-medium">Texto (selecione trecho e clique em Ocultar)</label>
            <textarea
              ref={clozeRef}
              value={clozeText}
              onChange={(e) => setClozeText(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm"
              rows={8}
            />
            <button
              type="button"
              onClick={wrapCloze}
              className="mt-2 rounded-lg border px-3 py-1 text-sm"
            >
              Ocultar seleção
            </button>
          </div>
        )}

        {type === "cloze_image" && (
          <div className="space-y-4">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
            />
            {imageUrl && (
              <ImageMaskEditor
                imageUrl={imageUrl}
                masks={masks}
                onChange={async (m) => {
                  setMasks(m)
                  if (m.length && userId) {
                    const fd = new FormData()
                    fd.append("user_id", userId)
                    const blob = await fetch(imageUrl).then((r) => r.blob())
                    fd.append("file", new File([blob], "img.png"))
                    fd.append("masks", JSON.stringify(m))
                    const res = await fetch("/api/flashcards/cards/upload", { method: "POST", body: fd })
                    const data = await res.json()
                    setOccludedUrl(data.image_occluded_url)
                  }
                }}
              />
            )}
          </div>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-emerald-600 py-3 text-white disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar card"}
        </button>
      </div>
    </main>
  )
}
