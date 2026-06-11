import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { getSharedAsset, mapDbAsset } from "@/lib/shared-assets"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = new URL(req.url).searchParams.get("user_id")
  if (!userId) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const asset = await getSharedAsset(id, userId)
    if (!asset) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    }
    return NextResponse.json({ asset })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { user_id, kind, title, label, content, width_pct } = body as {
    user_id: string
    kind?: "text" | "image"
    title?: string | null
    label?: string
    content?: string
    width_pct?: number | null
  }

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (kind != null) patch.kind = kind
  if (title !== undefined) patch.title = title?.trim() || null
  if (label != null) patch.label = label.trim() || "Sem rótulo"
  if (content != null) patch.content = content.trim()
  if (width_pct !== undefined) {
    patch.width_pct =
      typeof width_pct === "number"
        ? Math.min(100, Math.max(15, Math.round(width_pct)))
        : null
  }

  const { data, error } = await supabaseServer
    .from("user_shared_assets")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user_id)
    .select("*")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }

  return NextResponse.json({ asset: mapDbAsset(data) })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = new URL(req.url).searchParams.get("user_id")
  if (!userId) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { error } = await supabaseServer
    .from("user_shared_assets")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
