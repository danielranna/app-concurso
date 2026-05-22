import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

const DEFAULTS = {
  enabled: false,
  phone_e164: null,
  start_hour: 7,
  end_hour: 19,
  timezone: "America/Sao_Paulo",
}

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const { data } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("*")
    .eq("user_id", user_id)
    .maybeSingle()

  return NextResponse.json(data ?? { user_id, ...DEFAULTS })
}

export async function PUT(req: Request) {
  const { user_id, enabled, phone_e164, start_hour, end_hour, timezone } = await req.json()
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("flashcard_bot_settings")
    .upsert(
      {
        user_id,
        enabled: enabled ?? false,
        phone_e164: phone_e164 ?? null,
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
