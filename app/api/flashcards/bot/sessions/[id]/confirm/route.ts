import { NextResponse } from "next/server"
import { authenticateBot } from "@/lib/bot-auth"
import { computeDispatchSchedule } from "@/lib/bot-dispatch"
import { supabaseServer } from "@/lib/supabase-server"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateBot(req)
  if ("error" in auth) return auth.error

  const { id } = await params
  const confirmedAt = new Date()

  const { data: session, error: sessErr } = await supabaseServer
    .from("flashcard_bot_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single()

  if (sessErr || !session) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })
  }

  const { data: settings } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("start_hour, end_hour")
    .eq("user_id", auth.userId)
    .maybeSingle()

  const startHour = settings?.start_hour ?? 7
  const endHour = settings?.end_hour ?? 19
  const cardIds = (session.card_ids as string[]) ?? []

  const { windowStart, windowEnd, times } = computeDispatchSchedule(
    cardIds.length,
    confirmedAt,
    startHour,
    endHour
  )

  const dispatchRows = cardIds.map((cardId, i) => ({
    user_id: auth.userId,
    session_id: id,
    card_id: cardId,
    scheduled_at: times[i].toISOString(),
  }))

  if (dispatchRows.length > 0) {
    const { error: dispErr } = await supabaseServer
      .from("flashcard_bot_dispatch")
      .insert(dispatchRows)

    if (dispErr) {
      return NextResponse.json({ error: dispErr.message }, { status: 500 })
    }
  }

  const { data: updated, error: updErr } = await supabaseServer
    .from("flashcard_bot_sessions")
    .update({
      status: "active",
      confirmed_at: confirmedAt.toISOString(),
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({
    session: updated,
    dispatch_count: dispatchRows.length,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
  })
}
