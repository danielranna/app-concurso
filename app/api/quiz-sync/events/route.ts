import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userId = url.searchParams.get("user_id")
  if (!userId) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }
  const direction = url.searchParams.get("direction")
  const kind = url.searchParams.get("kind")
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 80)))

  let q = supabaseServer
    .from("quiz_sync_event_log")
    .select(
      "id, direction, kind, ok, http_status, pending, reason, caderno_id, tec_id, user_jid, payload, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit)
  if (direction === "in" || direction === "out") q = q.eq("direction", direction)
  if (kind) q = q.eq("kind", kind)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data ?? [] })
}
