import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

const BUCKET = "question-media"

export async function POST(req: Request) {
  const form = await req.formData()
  const user_id = form.get("user_id") as string
  const file = form.get("file") as File | null

  if (!user_id || !file) {
    return NextResponse.json({ error: "user_id e file são obrigatórios" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split(".").pop() || "png"
  const path = `${user_id}/${Date.now()}.${ext}`

  const { error: upErr } = await supabaseServer.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data } = supabaseServer.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
