import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { generateOccludedImage } from "@/lib/image-occlusion"
import type { ImageMask } from "@/lib/flashcard-types"

const BUCKET = "flashcard-images"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user_id, masks } = await req.json()

  if (!user_id || !masks?.length) {
    return NextResponse.json({ error: "user_id e masks são obrigatórios" }, { status: 400 })
  }

  const { data: card, error: cardErr } = await supabaseServer
    .from("flashcards")
    .select("image_url")
    .eq("id", id)
    .eq("user_id", user_id)
    .single()

  if (cardErr || !card?.image_url) {
    return NextResponse.json({ error: "Card ou imagem não encontrado" }, { status: 404 })
  }

  const res = await fetch(card.image_url)
  if (!res.ok) {
    return NextResponse.json({ error: "Falha ao baixar imagem" }, { status: 500 })
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const occluded = await generateOccludedImage(buffer, masks as ImageMask[])
  const path = `${user_id}/occluded/${id}.png`

  await supabaseServer.storage.from(BUCKET).upload(path, occluded, {
    contentType: "image/png",
    upsert: true,
  })

  const { data: urlData } = supabaseServer.storage.from(BUCKET).getPublicUrl(path)

  const { data, error } = await supabaseServer
    .from("flashcards")
    .update({
      image_masks: masks,
      image_occluded_url: urlData.publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
