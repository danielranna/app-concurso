"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ImageMaskEditor from "@/components/flashcards/ImageMaskEditor"
import type { ImageMask } from "@/lib/flashcard-types"

export default function EditCardPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deckId, setDeckId] = useState("")
  const [type, setType] = useState("")
  const [frontText, setFrontText] = useState("")
  const [backText, setBackText] = useState("")
  const [clozeText, setClozeText] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [occludedUrl, setOccludedUrl] = useState<string | null>(null)
  const [masks, setMasks] = useState<ImageMask[]>([])

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
      setImageUrl(card.image_url ?? null)
      setOccludedUrl(card.image_occluded_url ?? card.image_url ?? null)
      setMasks((card.image_masks as ImageMask[]) ?? [])
      setLoading(false)
    })
  }, [id, router])

  async function uploadImage(file: File) {
    if (!userId) return
    const fd = new FormData()
    fd.append("user_id", userId)
    fd.append("file", file)
    if (masks.length) fd.append("masks", JSON.stringify(masks))
    const res = await fetch("/api/flashcards/cards/upload", { method: "POST", body: fd })
    const data = await res.json()
    if (!data.image_url) return
    setImageUrl(data.image_url)
    setOccludedUrl(data.image_occluded_url)
    setMasks(data.image_masks ?? [])
  }

  async function regenerateOcclusion(nextMasks: ImageMask[]) {
    if (!userId || !imageUrl || !nextMasks.length) {
      setOccludedUrl(imageUrl)
      return
    }
    const blob = await fetch(imageUrl).then((r) => r.blob())
    const fd = new FormData()
    fd.append("user_id", userId)
    fd.append("file", new File([blob], "img.png"))
    fd.append("masks", JSON.stringify(nextMasks))
    const res = await fetch("/api/flashcards/cards/upload", { method: "POST", body: fd })
    const data = await res.json()
    if (data.image_occluded_url) setOccludedUrl(data.image_occluded_url)
  }

  async function save() {
    if (!userId) return
    setSaving(true)
    const body: Record<string, unknown> = { user_id: userId }
    if (type === "basic") {
      body.front_text = frontText
      body.back_text = backText
    } else if (type === "cloze_text") {
      body.cloze_text = clozeText
    } else if (type === "cloze_image") {
      body.image_url = imageUrl
      body.image_occluded_url = occludedUrl ?? imageUrl
      body.image_masks = masks
    }
    await fetch(`/api/flashcards/cards/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setSaving(false)
    router.push(`/flashcards/decks/${deckId}`)
  }

  if (!userId) return null

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-6">
        <p className="text-slate-500">Carregando...</p>
      </main>
    )
  }

  return (
    <main className={`mx-auto px-6 py-6 ${type === "cloze_image" ? "max-w-5xl" : "max-w-2xl"}`}>
      <Link href={`/flashcards/decks/${deckId}`} className="text-sm text-slate-600 hover:underline">
        ← Voltar
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Editar card</h1>
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
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Trocar imagem</label>
              <input
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-sm"
                onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
              />
            </div>
            {imageUrl ? (
              <ImageMaskEditor
                imageUrl={imageUrl}
                masks={masks}
                onChange={async (m) => {
                  setMasks(m)
                  await regenerateOcclusion(m)
                }}
              />
            ) : (
              <p className="text-sm text-slate-500">Nenhuma imagem neste card.</p>
            )}
          </div>
        )}
        <div className="flex items-center gap-4">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-6 py-2 text-white disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <Link href={`/flashcards/decks/${deckId}`} className="text-sm text-slate-600">
            Cancelar
          </Link>
        </div>
      </div>
    </main>
  )
}
