import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/**
 * Marca whatsapp_authorized=true após o usuário confirmar SIM no WhatsApp.
 * Atalho enquanto o Papa Vagas não chama POST .../bot/whatsapp-authorized automaticamente.
 */
export async function POST(req: Request) {
  const { user_id } = await req.json()
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const { data: settings } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("whatsapp_jid")
    .eq("user_id", user_id)
    .maybeSingle()

  if (!settings?.whatsapp_jid) {
    return NextResponse.json(
      { error: "Vincule o WhatsApp antes de confirmar autorização." },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from("flashcard_bot_settings")
    .update({
      whatsapp_authorized: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, whatsapp_authorized: true })
}
