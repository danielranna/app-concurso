import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { generateOccludedImage } from "@/lib/image-occlusion"
import type { ImageMask } from "@/lib/flashcard-types"

const BUCKET = "flashcard-images"

export async function POST(req: Request) {
  const form = await req.formData()
  const user_id = form.get("user_id") as string
  const file = form.get("file") as File | null
  const masksRaw = form.get("masks") as string | null

  if (!user_id || !file) {
    return NextResponse.json({ error: "user_id e file são obrigatórios" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split(".").pop() || "png"
  const base = `${user_id}/${Date.now()}`
  const originalPath = `${base}/original.${ext}`

  const { error: upErr } = await supabaseServer.storage
    .from(BUCKET)
    .upload(originalPath, buffer, { contentType: file.type, upsert: true })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data: origUrl } = supabaseServer.storage.from(BUCKET).getPublicUrl(originalPath)

  let occludedUrl: string | null = null
  if (masksRaw) {
    const masks = JSON.parse(masksRaw) as ImageMask[]
    if (masks.length > 0) {
      const occluded = await generateOccludedImage(buffer, masks)
      const occludedPath = `${base}/occluded.png`
      const { error: occErr } = await supabaseServer.storage
        .from(BUCKET)
        .upload(occludedPath, occluded, { contentType: "image/png", upsert: true })

      if (!occErr) {
        const { data: occ } = supabaseServer.storage.from(BUCKET).getPublicUrl(occludedPath)
        occludedUrl = occ.publicUrl
      }
    }
  }

  return NextResponse.json({
    image_url: origUrl.publicUrl,
    image_occluded_url: occludedUrl ?? origUrl.publicUrl,
    image_masks: masksRaw ? JSON.parse(masksRaw) : [],
  })
}
