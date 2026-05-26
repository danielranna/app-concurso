import { getAnonClient } from "./supabase.js"

export async function resolveUserFromRequest(req, config) {
  const headerSecret = req.headers["x-coach-upload-secret"]
  if (config.sharedSecret) {
    if (headerSecret !== config.sharedSecret) {
      return { error: "Secret inválido", status: 401 }
    }
  }

  const auth = req.headers.authorization || ""
  const match = auth.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) {
    return { error: "Token ausente (Authorization: Bearer)", status: 401 }
  }

  const token = match[1].trim()
  const anon = getAnonClient(config)
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data.user?.id) {
    return { error: "Sessão inválida ou expirada. Faça login de novo.", status: 401 }
  }

  return { userId: data.user.id }
}
