import { NextResponse } from "next/server"
import { extensionCorsHeaders, isUuid } from "@/lib/extension-tec"
import { supabaseServer } from "@/lib/supabase-server"

export const runtime = "nodejs"

const cors = {
  ...extensionCorsHeaders,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors })
}

async function requireUser(userId: unknown) {
  const id = String(userId || "")
  if (!isUuid(id)) return { error: "Usuário inválido." as const }
  const { data, error } = await supabaseServer.auth.admin.getUserById(id)
  if (error || !data?.user) return { error: "Faça login no app de novo." as const }
  return { userId: id }
}

function noteId(value: unknown) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

function missingMirror(message: string) {
  return /anki_note_id|anki_note_tombstones|column|relation|schema cache/i.test(message)
}

export async function GET(req: Request) {
  const user = await requireUser(new URL(req.url).searchParams.get("user_id"))
  if ("error" in user) {
    return NextResponse.json({ error: user.error }, { status: 401, headers: cors })
  }

  const { data: links, error } = await supabaseServer
    .from("errors")
    .select("id, anki_note_id")
    .eq("user_id", user.userId)
    .not("anki_note_id", "is", null)

  if (error) {
    if (missingMirror(error.message)) {
      return NextResponse.json({ ready: false, links: [], tombstones: [] }, { headers: cors })
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  }

  const { data: tombstones, error: tombError } = await supabaseServer
    .from("anki_note_tombstones")
    .select("id, anki_note_id")
    .eq("user_id", user.userId)
    .order("created_at", { ascending: true })
    .limit(200)

  if (tombError) {
    if (missingMirror(tombError.message)) {
      return NextResponse.json({ ready: false, links: [], tombstones: [] }, { headers: cors })
    }
    return NextResponse.json({ error: tombError.message }, { status: 500, headers: cors })
  }

  return NextResponse.json(
    {
      ready: true,
      links: (links || [])
        .map((row) => ({ error_id: String(row.id), anki_note_id: noteId(row.anki_note_id) }))
        .filter((row) => row.anki_note_id > 0),
      tombstones: (tombstones || [])
        .map((row) => ({ id: String(row.id), anki_note_id: noteId(row.anki_note_id) }))
        .filter((row) => row.anki_note_id > 0),
    },
    { headers: cors }
  )
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    user_id?: string
    tombstone_ids?: unknown
  } | null
  const user = await requireUser(body?.user_id)
  if ("error" in user) {
    return NextResponse.json({ error: user.error }, { status: 401, headers: cors })
  }
  const ids = [...new Set((Array.isArray(body?.tombstone_ids) ? body.tombstone_ids : []).map(String))]
    .filter((id) => isUuid(id))
    .slice(0, 200)
  if (!ids.length) return NextResponse.json({ ok: true }, { headers: cors })

  const { error } = await supabaseServer
    .from("anki_note_tombstones")
    .delete()
    .eq("user_id", user.userId)
    .in("id", ids)

  if (error && !missingMirror(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  }
  return NextResponse.json({ ok: true }, { headers: cors })
}
