import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { generateApiKey, hashApiKey } from "@/lib/bot-auth"

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("flashcard_api_keys")
    .select("id, label, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { user_id, label } = await req.json()
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const apiKey = generateApiKey()
  const key_hash = hashApiKey(apiKey)

  const { data, error } = await supabaseServer
    .from("flashcard_api_keys")
    .insert({ user_id, key_hash, label: label ?? "Bot WhatsApp" })
    .select("id, label, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ...data,
    api_key: apiKey,
    warning: "Guarde esta chave agora. Ela não será exibida novamente.",
  })
}

export async function DELETE(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  const id = new URL(req.url).searchParams.get("id")

  if (!user_id || !id) {
    return NextResponse.json({ error: "user_id e id são obrigatórios" }, { status: 400 })
  }

  const { error } = await supabaseServer
    .from("flashcard_api_keys")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
