import { NextResponse } from "next/server"
import { getQuizBotSecret } from "@/lib/quiz-bot-url"
import { supabaseServer } from "@/lib/supabase-server"

/**
 * Chamado pelo Papa Vagas / bot quando o usuário responde SIM.
 * Authorization: Bearer QUIZ_BOT_USERS_SECRET
 */
export async function POST(req: Request) {
  const secret = getQuizBotSecret()
  const auth = req.headers.get("authorization")

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const { userJid, apiKey } = await req.json()
  if (!userJid && !apiKey) {
    return NextResponse.json({ error: "userJid ou apiKey obrigatório" }, { status: 400 })
  }

  let user_id: string | null = null

  if (apiKey?.startsWith("fc_")) {
    const { hashApiKey } = await import("@/lib/bot-auth")
    const { data: keyRow } = await supabaseServer
      .from("flashcard_api_keys")
      .select("user_id")
      .eq("key_hash", hashApiKey(apiKey))
      .maybeSingle()
    user_id = keyRow?.user_id ?? null
  }

  if (!user_id && userJid) {
    const { data: row } = await supabaseServer
      .from("flashcard_bot_settings")
      .select("user_id")
      .eq("whatsapp_jid", userJid)
      .maybeSingle()
    user_id = row?.user_id ?? null
  }

  if (!user_id) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
  }

  const { error } = await supabaseServer
    .from("flashcard_bot_settings")
    .update({
      whatsapp_authorized: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, user_id })
}
