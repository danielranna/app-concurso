import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto"
import { supabaseServer } from "../supabase-server"

const ALGO = "aes-256-gcm"

export type AiProvider = "openai" | "anthropic"

export type UserAiCredentials = {
  provider: AiProvider
  apiKey: string
}

function encryptionKey(): Buffer {
  const secret = process.env.AI_CREDENTIALS_SECRET?.trim()
  if (secret) {
    return createHash("sha256").update(secret).digest()
  }
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (sr) {
    return createHash("sha256").update(`user-ai:${sr}`).digest()
  }
  throw new Error(
    "Configure AI_CREDENTIALS_SECRET no servidor (recomendado em produção)."
  )
}

export function encryptApiKey(plain: string): string {
  const key = encryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString("base64")
}

export function decryptApiKey(blob: string): string {
  const buf = Buffer.from(blob, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = createDecipheriv(ALGO, encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8"
  )
}

export function keyHint(apiKey: string): string {
  const t = apiKey.trim()
  if (t.length <= 8) return "••••"
  return `…${t.slice(-4)}`
}

export async function userHasAiCredentials(userId: string): Promise<boolean> {
  const { data } = await supabaseServer
    .from("user_ai_credentials")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()
  return !!data
}

export async function getUserAiCredentialsStatus(userId: string) {
  const { data } = await supabaseServer
    .from("user_ai_credentials")
    .select("provider, key_hint, updated_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (!data) {
    return { configured: false as const }
  }

  return {
    configured: true as const,
    provider: data.provider as AiProvider,
    key_hint: data.key_hint as string,
    updated_at: data.updated_at as string,
  }
}

export async function getUserAiCredentials(
  userId: string
): Promise<UserAiCredentials | null> {
  const { data, error } = await supabaseServer
    .from("user_ai_credentials")
    .select("provider, encrypted_key")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) return null

  try {
    return {
      provider: data.provider as AiProvider,
      apiKey: decryptApiKey(data.encrypted_key),
    }
  } catch {
    return null
  }
}

export async function saveUserAiCredentials(
  userId: string,
  provider: AiProvider,
  apiKey: string
) {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error("Chave vazia")

  const { error } = await supabaseServer.from("user_ai_credentials").upsert(
    {
      user_id: userId,
      provider,
      encrypted_key: encryptApiKey(trimmed),
      key_hint: keyHint(trimmed),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  )

  if (error) throw new Error(error.message)
}

export async function deleteUserAiCredentials(userId: string) {
  const { error } = await supabaseServer
    .from("user_ai_credentials")
    .delete()
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
}

export async function validateProviderApiKey(
  provider: AiProvider,
  apiKey: string
): Promise<void> {
  const key = apiKey.trim()
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(
        res.status === 401
          ? "Chave OpenAI inválida ou revogada."
          : `OpenAI: ${err.slice(0, 200)}`
      )
    }
    return
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 8,
      messages: [{ role: "user", content: "ok" }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(
      res.status === 401
        ? "Chave Anthropic inválida ou revogada."
        : `Anthropic: ${err.slice(0, 200)}`
    )
  }
}
