import { NextResponse } from "next/server"
import { authenticateBot } from "@/lib/bot-auth"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const auth = await authenticateBot(req)
  if ("error" in auth) return auth.error

  const { data, error } = await supabaseServer
    .from("flashcard_bot_sessions")
    .select("*")
    .eq("user_id", auth.userId)
    .in("status", ["pending_confirm", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
