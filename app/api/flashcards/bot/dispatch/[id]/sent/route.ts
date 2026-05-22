import { NextResponse } from "next/server"
import { authenticateBot } from "@/lib/bot-auth"
import { supabaseServer } from "@/lib/supabase-server"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateBot(_req)
  if ("error" in auth) return auth.error

  const { id } = await params

  const { data, error } = await supabaseServer
    .from("flashcard_bot_dispatch")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
