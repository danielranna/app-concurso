import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { DEFAULT_WEEKDAY_LIMITS } from "@/lib/flashcard-types"
import { getOptimizerStatus, optimizeUserFsrsParams } from "@/lib/fsrs-optimizer"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  try {
    const status = await getOptimizerStatus(user_id)
    const { data } = await supabaseServer
      .from("flashcard_schedule_settings")
      .select("fsrs_parameters")
      .eq("user_id", user_id)
      .maybeSingle()

    const fsrs = (data?.fsrs_parameters ?? {}) as { optimized_at?: string; w?: number[] }
    return NextResponse.json({
      ...status,
      optimized_at: fsrs.optimized_at ?? null,
      has_custom_w: Array.isArray(fsrs.w) && fsrs.w.length > 0,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { user_id } = await req.json()
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  try {
    const { w, review_count, card_count } = await optimizeUserFsrsParams(user_id)

    const { data: existing } = await supabaseServer
      .from("flashcard_schedule_settings")
      .select("fsrs_parameters, weekday_limits")
      .eq("user_id", user_id)
      .maybeSingle()

    const prev = (existing?.fsrs_parameters ?? {}) as Record<string, unknown>
    const fsrs_parameters = {
      ...prev,
      w,
      optimized_at: new Date().toISOString(),
    }

    const { error } = await supabaseServer.from("flashcard_schedule_settings").upsert(
      {
        user_id,
        weekday_limits: existing?.weekday_limits ?? DEFAULT_WEEKDAY_LIMITS,
        fsrs_parameters,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      review_count,
      card_count,
      optimized_at: fsrs_parameters.optimized_at,
      w_length: w.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
