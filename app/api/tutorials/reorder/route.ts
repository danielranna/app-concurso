import { NextResponse } from "next/server"
import { requireTutorialManager } from "@/lib/tutorial-permissions"
import { supabaseServer } from "@/lib/supabase-server"

export async function POST(req: Request) {
  const auth = await requireTutorialManager(req)
  if (!auth.user) return auth.response

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)) : []

  if (!ids.length || ids.some((id: string) => !id)) {
    return NextResponse.json({ error: "Lista de IDs inválida" }, { status: 400 })
  }

  const unique = new Set(ids)
  if (unique.size !== ids.length) {
    return NextResponse.json({ error: "IDs duplicados na ordem" }, { status: 400 })
  }

  const now = new Date().toISOString()
  const results = await Promise.all(
    ids.map((id: string, index: number) =>
      supabaseServer
        .from("tutorials")
        .update({ sort_order: index, updated_at: now })
        .eq("id", id)
    )
  )

  const failed = results.find((r) => r.error)
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
