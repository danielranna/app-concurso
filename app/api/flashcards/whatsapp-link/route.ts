import { NextResponse } from "next/server"
import { getQuizBotSecret, getQuizLinkRequestUrl } from "@/lib/quiz-bot-url"
import { supabaseServer } from "@/lib/supabase-server"
import { hashApiKey } from "@/lib/bot-auth"

/**
 * Após vincular no app, avisa o bot (Papa Vagas) para enviar SIM/NÃO no privado.
 * Body: { user_id, userJid, apiKey, displayLabel? }
 */
export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, userJid, apiKey, displayLabel } = body

  if (!user_id || !userJid || !apiKey?.startsWith("fc_")) {
    return NextResponse.json(
      { error: "user_id, userJid e apiKey (fc_...) são obrigatórios" },
      { status: 400 }
    )
  }

  const keyHash = hashApiKey(apiKey)
  const { data: keyRow } = await supabaseServer
    .from("flashcard_api_keys")
    .select("id")
    .eq("user_id", user_id)
    .eq("key_hash", keyHash)
    .maybeSingle()

  if (!keyRow) {
    return NextResponse.json(
      {
        error:
          "API key inválida para esta conta. Gere uma nova em Configurações e use a chave exibida ao vincular.",
      },
      { status: 400 }
    )
  }

  const linkUrl = getQuizLinkRequestUrl()
  const secret = getQuizBotSecret()

  if (!linkUrl || !secret) {
    return NextResponse.json(
      {
        error: "Configure QUIZ_BOT_USERS_URL e QUIZ_BOT_USERS_SECRET no Vercel.",
      },
      { status: 503 }
    )
  }

  try {
    const res = await fetch(linkUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userJid,
        apiKey,
        displayLabel: displayLabel ?? null,
      }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? `Papa Vagas retornou ${res.status}`, details: data },
        { status: res.status }
      )
    }

    await supabaseServer
      .from("flashcard_bot_settings")
      .upsert(
        {
          user_id,
          whatsapp_jid: userJid,
          whatsapp_display_label: displayLabel ?? null,
          whatsapp_link_requested_at: new Date().toISOString(),
          whatsapp_authorized: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )

    return NextResponse.json({
      ok: true,
      message:
        "Confira o WhatsApp e responda SIM para autorizar. A mensagem pode levar até ~90 segundos.",
      ...data,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao solicitar confirmação"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
