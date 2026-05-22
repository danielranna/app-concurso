import { NextResponse } from "next/server"

export type WhatsAppUserOption = {
  userJid: string
  displayLabel: string
  engaged?: boolean
}

/**
 * Proxy server-side para o site Quiz (Papa Vagas).
 * Env: QUIZ_BOT_USERS_URL, QUIZ_BOT_USERS_SECRET (= FLASHCARDS_BOT_INBOUND_SECRET no quiz)
 */
export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  const quizUrl = process.env.QUIZ_BOT_USERS_URL
  const secret = process.env.QUIZ_BOT_USERS_SECRET

  if (!quizUrl || !secret) {
    return NextResponse.json(
      {
        users: [],
        configured: false,
        error:
          "Configure QUIZ_BOT_USERS_URL e QUIZ_BOT_USERS_SECRET no Vercel (projeto Flashcards).",
        hint: "O secret deve ser igual a FLASHCARDS_BOT_INBOUND_SECRET no projeto Quiz.",
      },
      { status: 503 }
    )
  }

  try {
    const res = await fetch(quizUrl, {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      cache: "no-store",
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return NextResponse.json(
        {
          users: [],
          configured: true,
          error: data.error ?? `Quiz API retornou ${res.status}`,
          hint: data.hint,
        },
        { status: res.status }
      )
    }

    const users = (data.users ?? []) as WhatsAppUserOption[]

    return NextResponse.json({
      users: users.map((u) => ({
        userJid: u.userJid ?? (u as { user_jid?: string }).user_jid,
        displayLabel:
          u.displayLabel ??
          (u as { display_label?: string }).display_label ??
          u.userJid,
        engaged: u.engaged ?? false,
      })),
      warning: data.warning ?? null,
      hint: data.hint ?? null,
      configured: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao buscar usuários"
    return NextResponse.json(
      { users: [], configured: true, error: msg },
      { status: 502 }
    )
  }
}
