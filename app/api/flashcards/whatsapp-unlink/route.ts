import { NextResponse } from "next/server"
import { getQuizBotSecret, getQuizUnlinkRequestUrl } from "@/lib/quiz-bot-url"
import { supabaseServer } from "@/lib/supabase-server"
import { hashApiKey } from "@/lib/bot-auth"

/**
 * Desvincula WhatsApp no Flashcards e opcionalmente avisa o Papa Vagas.
 * Body: { user_id, apiKey? } — apiKey opcional para notificar o quiz
 */
export async function POST(req: Request) {
  const { user_id, apiKey } = await req.json()

  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const { data: settings } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("whatsapp_jid, whatsapp_display_label")
    .eq("user_id", user_id)
    .maybeSingle()

  const userJid = settings?.whatsapp_jid

  let quizNotified = false
  const unlinkUrl = getQuizUnlinkRequestUrl()
  const secret = getQuizBotSecret()

  if (userJid && apiKey?.startsWith("fc_") && unlinkUrl && secret) {
    const keyHash = hashApiKey(apiKey)
    const { data: keyRow } = await supabaseServer
      .from("flashcard_api_keys")
      .select("id")
      .eq("user_id", user_id)
      .eq("key_hash", keyHash)
      .maybeSingle()

    if (keyRow) {
      try {
        const res = await fetch(unlinkUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userJid, apiKey }),
        })
        quizNotified = res.ok
      } catch {
        /* limpa local mesmo se o quiz falhar */
      }
    }
  }

  const { error } = await supabaseServer
    .from("flashcard_bot_settings")
    .upsert(
      {
        user_id,
        whatsapp_jid: null,
        whatsapp_display_label: null,
        whatsapp_link_requested_at: null,
        whatsapp_authorized: false,
        enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    message: "WhatsApp desvinculado.",
    quiz_notified: quizNotified,
  })
}
