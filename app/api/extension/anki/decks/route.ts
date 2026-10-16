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

function missingTable(message: string) {
  return /anki_deck_links|relation|schema cache/i.test(message)
}

async function listDecks(userId: string) {
  const { data, error } = await supabaseServer
    .from("anki_deck_links")
    .select("deck_name, subject_id")
    .eq("user_id", userId)
    .order("deck_name", { ascending: true })

  if (error) return { error }
  return {
    decks: (data || []).map((row) => ({
      deck_name: String(row.deck_name),
      subject_id: row.subject_id ? String(row.subject_id) : "",
    })),
  }
}

export async function GET(req: Request) {
  const user = await requireUser(new URL(req.url).searchParams.get("user_id"))
  if ("error" in user) {
    return NextResponse.json({ error: user.error }, { status: 401, headers: cors })
  }
  const listed = await listDecks(user.userId)
  if ("error" in listed && listed.error) {
    if (missingTable(listed.error.message)) {
      return NextResponse.json({ ready: false, decks: [] }, { headers: cors })
    }
    return NextResponse.json({ error: listed.error.message }, { status: 500, headers: cors })
  }
  return NextResponse.json({ ready: true, ...listed }, { headers: cors })
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    user_id?: string
    decks?: unknown
    deck_name?: string
    subject_id?: string | null
  } | null
  const user = await requireUser(body?.user_id)
  if ("error" in user) {
    return NextResponse.json({ error: user.error }, { status: 401, headers: cors })
  }

  if (Array.isArray(body?.decks)) {
    const names = [...new Set(body.decks.map((name) => String(name || "").trim()).filter(Boolean))]
    const current = await listDecks(user.userId)
    if ("error" in current && current.error) {
      if (missingTable(current.error.message)) {
        return NextResponse.json(
          { ready: false, error: "Rode o SQL da associação de baralhos." },
          { status: 500, headers: cors }
        )
      }
      return NextResponse.json({ error: current.error.message }, { status: 500, headers: cors })
    }
    const have = new Set((current.decks || []).map((row) => row.deck_name))
    const missing = names.filter((name) => !have.has(name))
    if (missing.length) {
      const { error } = await supabaseServer.from("anki_deck_links").insert(
        missing.map((deck_name) => ({ user_id: user.userId, deck_name }))
      )
      if (error && !/duplicate|unique/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
      }
    }
  } else if (body?.deck_name) {
    const deckName = String(body.deck_name).trim()
    const subjectId = body.subject_id ? String(body.subject_id) : null
    if (subjectId && !isUuid(subjectId)) {
      return NextResponse.json({ error: "Matéria inválida." }, { status: 400, headers: cors })
    }
    const { error } = await supabaseServer
      .from("anki_deck_links")
      .upsert(
        {
          user_id: user.userId,
          deck_name: deckName,
          subject_id: subjectId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,deck_name" }
      )
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
    }
  }

  const listed = await listDecks(user.userId)
  if ("error" in listed && listed.error) {
    return NextResponse.json({ error: listed.error.message }, { status: 500, headers: cors })
  }
  return NextResponse.json({ ready: true, ...listed }, { headers: cors })
}
