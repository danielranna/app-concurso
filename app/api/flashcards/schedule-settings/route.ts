import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  clampRetention,
  RETENTION_MAX,
  RETENTION_MIN,
} from "@/lib/flashcard-fsrs-params"
import {
  DEFAULT_REQUEST_RETENTION,
  DEFAULT_WEEKDAY_LIMITS,
  type UserFsrsSettings,
} from "@/lib/flashcard-types"

function normalizeFsrsSettings(raw: unknown): UserFsrsSettings {
  const src = (raw ?? {}) as UserFsrsSettings
  const out: UserFsrsSettings = { ...src }
  if (out.request_retention != null) {
    out.request_retention = clampRetention(out.request_retention)
  }
  return out
}

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const { data } = await supabaseServer
    .from("flashcard_schedule_settings")
    .select("weekday_limits, fsrs_parameters")
    .eq("user_id", user_id)
    .maybeSingle()

  const fsrs = normalizeFsrsSettings(data?.fsrs_parameters)

  return NextResponse.json({
    weekday_limits: data?.weekday_limits ?? DEFAULT_WEEKDAY_LIMITS,
    fsrs_parameters: fsrs,
    request_retention: fsrs.request_retention ?? DEFAULT_REQUEST_RETENTION,
    retention_min: RETENTION_MIN,
    retention_max: RETENTION_MAX,
  })
}

export async function PUT(req: Request) {
  const { user_id, weekday_limits, fsrs_parameters, request_retention } = await req.json()
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const { data: existing } = await supabaseServer
    .from("flashcard_schedule_settings")
    .select("fsrs_parameters, weekday_limits")
    .eq("user_id", user_id)
    .maybeSingle()

  const prevFsrs = normalizeFsrsSettings(existing?.fsrs_parameters)
  const nextFsrs: UserFsrsSettings = { ...prevFsrs, ...(fsrs_parameters ?? {}) }

  if (request_retention != null) {
    nextFsrs.request_retention = clampRetention(Number(request_retention))
  }

  const { data, error } = await supabaseServer
    .from("flashcard_schedule_settings")
    .upsert(
      {
        user_id,
        weekday_limits: weekday_limits ?? existing?.weekday_limits ?? DEFAULT_WEEKDAY_LIMITS,
        fsrs_parameters: nextFsrs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
