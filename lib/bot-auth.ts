import { createHash, randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { supabaseServer } from "./supabase-server"

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

export function generateApiKey(): string {
  return `fc_${randomBytes(32).toString("hex")}`
}

export async function authenticateBot(req: Request): Promise<
  | { userId: string }
  | { error: NextResponse }
> {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) {
    return {
      error: NextResponse.json({ error: "Authorization Bearer obrigatório" }, { status: 401 }),
    }
  }

  const key = auth.slice(7).trim()
  const keyHash = hashApiKey(key)

  const { data, error } = await supabaseServer
    .from("flashcard_api_keys")
    .select("user_id")
    .eq("key_hash", keyHash)
    .maybeSingle()

  if (error || !data) {
    return {
      error: NextResponse.json({ error: "API key inválida" }, { status: 401 }),
    }
  }

  return { userId: data.user_id }
}
