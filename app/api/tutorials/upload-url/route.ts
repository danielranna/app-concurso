import { NextResponse } from "next/server"
import { requireTutorialManager } from "@/lib/tutorial-permissions"
import { supabaseServer } from "@/lib/supabase-server"
import {
  TUTORIALS_BUCKET,
  TUTORIAL_MAX_BYTES,
  TUTORIAL_VIDEO_TYPES,
} from "@/lib/tutorials"

const THUMB_TYPES = new Set(["image/jpeg", "image/png"])

export async function POST(req: Request) {
  const auth = await requireTutorialManager(req)
  if (!auth.user) return auth.response

  const body = await req.json().catch(() => ({}))
  const filename = String(body.filename ?? "").trim()
  const contentType = String(body.contentType ?? "").trim()
  const kind = body.kind === "thumbnail" ? "thumbnail" : "video"

  if (!filename || !contentType) {
    return NextResponse.json(
      { error: "filename e contentType são obrigatórios" },
      { status: 400 }
    )
  }

  if (kind === "video") {
    const allowed =
      TUTORIAL_VIDEO_TYPES.includes(contentType as (typeof TUTORIAL_VIDEO_TYPES)[number]) ||
      filename.toLowerCase().endsWith(".mp4") ||
      filename.toLowerCase().endsWith(".webm") ||
      filename.toLowerCase().endsWith(".mov")
    if (!allowed) {
      return NextResponse.json(
        { error: "Formato de vídeo inválido. Use MP4, WebM ou MOV." },
        { status: 400 }
      )
    }
  } else if (!THUMB_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Thumbnail deve ser JPEG ou PNG" }, { status: 400 })
  }

  const ext = (filename.split(".").pop() || (kind === "thumbnail" ? "jpg" : "mp4"))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8) || (kind === "thumbnail" ? "jpg" : "mp4")

  const id = crypto.randomUUID()
  const path = `${auth.user.id}/${id}${kind === "thumbnail" ? "-thumb" : ""}.${ext}`

  const { data, error } = await supabaseServer.storage
    .from(TUTORIALS_BUCKET)
    .createSignedUploadUrl(path, { upsert: true })

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Não foi possível gerar URL de upload" },
      { status: 500 }
    )
  }

  const { data: publicData } = supabaseServer.storage
    .from(TUTORIALS_BUCKET)
    .getPublicUrl(path)

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
    publicUrl: publicData.publicUrl,
    maxBytes: TUTORIAL_MAX_BYTES,
  })
}
