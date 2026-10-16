import { NextResponse } from "next/server"
import { extensionCorsHeaders, isUuid } from "@/lib/extension-tec"
import { ankiNoteId } from "@/lib/anki-flashcard-sync"
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

function missingMirror(message: string) {
  return /anki_note_id|anki_review_queue|column|relation|schema cache/i.test(message)
}

export async function GET(req: Request) {
  const user = await requireUser(new URL(req.url).searchParams.get("user_id"))
  if ("error" in user) {
    return NextResponse.json({ error: user.error }, { status: 401, headers: cors })
  }

  const { data: cards, error } = await supabaseServer
    .from("flashcards")
    .select("id, anki_note_id")
    .eq("user_id", user.userId)
    .not("anki_note_id", "is", null)

  if (error) {
    if (missingMirror(error.message)) {
      return NextResponse.json({ ready: false, cards: [], pending: [] }, { headers: cors })
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  }

  const { data: pending, error: pendingError } = await supabaseServer
    .from("anki_review_queue")
    .select("id, flashcard_id, anki_note_id, rating")
    .eq("user_id", user.userId)
    .order("created_at", { ascending: true })
    .limit(100)

  if (pendingError) {
    if (missingMirror(pendingError.message)) {
      return NextResponse.json({ ready: false, cards: [], pending: [] }, { headers: cors })
    }
    return NextResponse.json({ error: pendingError.message }, { status: 500, headers: cors })
  }

  return NextResponse.json(
    {
      ready: true,
      cards: (cards || [])
        .map((row) => ({
          flashcard_id: String(row.id),
          anki_note_id: ankiNoteId(row.anki_note_id),
        }))
        .filter((row) => row.anki_note_id > 0),
      pending: (pending || [])
        .map((row) => ({
          id: String(row.id),
          flashcard_id: String(row.flashcard_id),
          anki_note_id: ankiNoteId(row.anki_note_id),
          rating: Number(row.rating),
        }))
        .filter((row) => row.anki_note_id > 0 && row.rating >= 1 && row.rating <= 4),
    },
    { headers: cors }
  )
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    user_id?: string
    updates?: { flashcard_id?: string; due_at?: string }[]
    applied?: unknown
  } | null
  const user = await requireUser(body?.user_id)
  if ("error" in user) {
    return NextResponse.json({ error: user.error }, { status: 401, headers: cors })
  }

  for (const update of Array.isArray(body?.updates) ? body.updates : []) {
    const cardId = String(update?.flashcard_id || "")
    const dueAt = String(update?.due_at || "")
    if (!isUuid(cardId) || Number.isNaN(new Date(dueAt).getTime())) continue
    const owned = await supabaseServer
      .from("flashcards")
      .select("id")
      .eq("id", cardId)
      .eq("user_id", user.userId)
      .maybeSingle()
    if (!owned.data) continue
    await supabaseServer
      .from("flashcard_states")
      .update({
        due_at: new Date(dueAt).toISOString(),
        state_data: { scheduler: "anki", anki_pending: false },
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.userId)
      .eq("card_id", cardId)
  }

  const applied = [...new Set((Array.isArray(body?.applied) ? body.applied : []).map(String))]
    .filter((id) => isUuid(id))
    .slice(0, 100)
  if (applied.length) {
    await supabaseServer
      .from("anki_review_queue")
      .delete()
      .eq("user_id", user.userId)
      .in("id", applied)
  }

  return NextResponse.json({ ok: true }, { headers: cors })
}
