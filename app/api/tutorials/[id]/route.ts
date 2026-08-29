import { NextResponse } from "next/server"
import {
  isTutorialManagerEmail,
  requireAuthUser,
  requireTutorialManager,
} from "@/lib/tutorial-permissions"
import { supabaseServer } from "@/lib/supabase-server"
import { TUTORIALS_BUCKET } from "@/lib/tutorials"

export const dynamic = "force-dynamic"

async function removeStorageFiles(paths: Array<string | null | undefined>) {
  const clean = paths.filter((p): p is string => Boolean(p))
  if (!clean.length) return
  await supabaseServer.storage.from(TUTORIALS_BUCKET).remove(clean)
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthUser(req)
  if (!auth.user) return auth.response

  const { id } = await params
  const { data, error } = await supabaseServer
    .from("tutorials")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Tutorial não encontrado" }, { status: 404 })
  }

  if (data.status !== "published" && !isTutorialManagerEmail(auth.user.email)) {
    return NextResponse.json({ error: "Tutorial não encontrado" }, { status: 404 })
  }

  return NextResponse.json({ tutorial: data })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTutorialManager(req)
  if (!auth.user) return auth.response

  const { id } = await params
  const { data: existing, error: existingErr } = await supabaseServer
    .from("tutorials")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: "Tutorial não encontrado" }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.title === "string") {
    const title = body.title.trim()
    if (!title) {
      return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 })
    }
    patch.title = title
  }
  if (typeof body.description === "string") {
    const description = body.description.trim()
    if (!description) {
      return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 })
    }
    patch.description = description
  }
  if (body.status === "draft" || body.status === "published") {
    patch.status = body.status
  }

  const replacingVideo =
    typeof body.video_path === "string" &&
    body.video_path.trim() &&
    typeof body.video_url === "string" &&
    body.video_url.trim()

  if (replacingVideo) {
    patch.video_path = String(body.video_path).trim()
    patch.video_url = String(body.video_url).trim()
    patch.thumbnail_path = body.thumbnail_path ? String(body.thumbnail_path).trim() : null
    patch.thumbnail_url = body.thumbnail_url ? String(body.thumbnail_url).trim() : null
  }

  const { data, error } = await supabaseServer
    .from("tutorials")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (replacingVideo) {
    await removeStorageFiles([
      existing.video_path !== patch.video_path ? existing.video_path : null,
      existing.thumbnail_path !== patch.thumbnail_path ? existing.thumbnail_path : null,
    ])
  }

  return NextResponse.json({ tutorial: data })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTutorialManager(req)
  if (!auth.user) return auth.response

  const { id } = await params
  const { data: existing, error: existingErr } = await supabaseServer
    .from("tutorials")
    .select("video_path, thumbnail_path")
    .eq("id", id)
    .maybeSingle()

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: "Tutorial não encontrado" }, { status: 404 })
  }

  const { error } = await supabaseServer.from("tutorials").delete().eq("id", id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await removeStorageFiles([existing.video_path, existing.thumbnail_path])
  return NextResponse.json({ success: true })
}
