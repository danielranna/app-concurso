/** Sync com lib/ai/user-credentials.ts (somente leitura/decrypt). */
import {
  createDecipheriv,
  createHash,
} from "crypto"

const ALGO = "aes-256-gcm"

function encryptionKey(config) {
  const secret = config.aiCredentialsSecret?.trim()
  if (secret) {
    return createHash("sha256").update(secret).digest()
  }
  const sr = config.serviceRoleKey?.trim()
  if (sr) {
    return createHash("sha256").update(`user-ai:${sr}`).digest()
  }
  throw new Error(
    "Configure AI_CREDENTIALS_SECRET na VPS (mesmo valor da Vercel)."
  )
}

function decryptApiKey(blob, config) {
  const buf = Buffer.from(blob, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = createDecipheriv(ALGO, encryptionKey(config), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8"
  )
}

export async function getUserAiCredentials(supabase, config, userId) {
  const { data, error } = await supabase
    .from("user_ai_credentials")
    .select("provider, encrypted_key")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) return null

  try {
    return {
      provider: data.provider,
      apiKey: decryptApiKey(data.encrypted_key, config),
    }
  } catch {
    return null
  }
}
