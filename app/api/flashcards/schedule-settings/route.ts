import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { DEFAULT_WEEKDAY_LIMITS } from "@/lib/flashcard-types"

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const { data } = await supabaseServer
    .from("flashcard_schedule_settings")
    .select("weekday_limits")
    .eq("user_id", user_id)
    .maybeSingle()

  return NextResponse.json({
    weekday_limits: data?.weekday_limits ?? DEFAULT_WEEKDAY_LIMITS,
  })
}

export async function PUT(req: Request) {
  const { user_id, weekday_limits } = await req.json()
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("flashcard_schedule_settings")
    .upsert(
      {
        user_id,
        weekday_limits: weekday_limits ?? DEFAULT_WEEKDAY_LIMITS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
