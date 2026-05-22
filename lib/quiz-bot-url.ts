/** Base do Papa Vagas derivada de QUIZ_BOT_USERS_URL */

export function getQuizBotBaseUrl(): string | null {
  const url = process.env.QUIZ_BOT_USERS_URL?.trim()
  if (!url) return null
  try {
    const u = new URL(url)
    return `${u.origin}`
  } catch {
    return url.replace(/\/api\/flashcards-whatsapp-users\/?$/i, "")
  }
}

export function getQuizBotSecret(): string | null {
  return process.env.QUIZ_BOT_USERS_SECRET?.trim() ?? null
}

export function getQuizLinkRequestUrl(): string | null {
  const base = getQuizBotBaseUrl()
  return base ? `${base}/api/flashcards-link-request` : null
}

export function getQuizUnlinkRequestUrl(): string | null {
  const base = getQuizBotBaseUrl()
  return base ? `${base}/api/flashcards-unlink-request` : null
}
