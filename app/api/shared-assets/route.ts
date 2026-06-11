import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { mapDbAsset } from "@/lib/shared-assets-types"
import { listUserSharedAssets } from "@/lib/shared-assets-server"

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("user_id")
  if (!userId) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const assets = await listUserSharedAssets(userId)
    return NextResponse.json({ assets })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, kind, title, label, content, width_pct } = body as {
    user_id: string
    kind: "text" | "image"
    title?: string | null
    label?: string
    content: string
    width_pct?: number | null
  }

  if (!user_id || !kind || !content?.trim()) {
    return NextResponse.json(
      { error: "user_id, kind e content são obrigatórios" },
      { status: 400 }
    )
  }

  if (kind !== "text" && kind !== "image") {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("user_shared_assets")
    .insert({
      user_id,
      kind,
      title: title?.trim() || null,
      label: label?.trim() || "Sem rótulo",
      content: content.trim(),
      width_pct:
        typeof width_pct === "number"
          ? Math.min(100, Math.max(15, Math.round(width_pct)))
          : null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ asset: mapDbAsset(data) })
}
