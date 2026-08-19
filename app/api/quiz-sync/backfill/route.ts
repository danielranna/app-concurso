import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { backfillWhatsappAnswers } from "@/lib/quiz-sync"

export async function POST(req: Request) {
  const { user_id } = await req.json().catch(() => ({}))
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data: settings } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("whatsapp_jid, whatsapp_authorized")
    .eq("user_id", user_id)
    .maybeSingle()

  if (!settings?.whatsapp_jid || settings.whatsapp_authorized === false) {
    return NextResponse.json(
      { error: "WhatsApp não vinculado. Autorize em Integrações." },
      { status: 400 }
    )
  }

  const result = await backfillWhatsappAnswers(user_id, settings.whatsapp_jid)
  return NextResponse.json({ ok: true, ...result })
}
