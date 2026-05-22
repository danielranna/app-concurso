import { NextResponse } from "next/server"
import { authenticateBot } from "@/lib/bot-auth"
import { supabaseServer } from "@/lib/supabase-server"

const DEFAULTS = {
  enabled: false,
  phone_e164: null as string | null,
  whatsapp_jid: null as string | null,
  whatsapp_display_label: null as string | null,
  start_hour: 7,
  end_hour: 19,
  timezone: "America/Sao_Paulo",
}

export async function GET(req: Request) {
  const auth = await authenticateBot(req)
  if ("error" in auth) return auth.error

  const { data } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("*")
    .eq("user_id", auth.userId)
    .maybeSingle()

  return NextResponse.json(data ?? { user_id: auth.userId, ...DEFAULTS })
}

export async function PUT(req: Request) {
  const auth = await authenticateBot(req)
  if ("error" in auth) return auth.error

  const body = await req.json()
  const {
    enabled,
    phone_e164,
    whatsapp_jid,
    whatsapp_display_label,
    start_hour,
    end_hour,
    timezone,
  } = body

  const { data, error } = await supabaseServer
    .from("flashcard_bot_settings")
    .upsert(
      {
        user_id: auth.userId,
        enabled: enabled ?? false,
        phone_e164: phone_e164 ?? null,
        whatsapp_jid: whatsapp_jid ?? null,
        whatsapp_display_label: whatsapp_display_label ?? null,
        start_hour: start_hour ?? 7,
        end_hour: end_hour ?? 19,
        timezone: timezone ?? "America/Sao_Paulo",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
