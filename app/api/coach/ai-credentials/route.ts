import { NextResponse } from "next/server"
import {
  deleteUserAiCredentials,
  getUserAiCredentialsStatus,
  saveUserAiCredentials,
  validateProviderApiKey,
  type AiProvider,
} from "@/lib/ai/user-credentials"

function parseProvider(v: unknown): AiProvider {
  if (v === "anthropic") return "anthropic"
  return "openai"
}

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const status = await getUserAiCredentialsStatus(user_id)
  return NextResponse.json(status)
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, api_key, provider: rawProvider } = body

  if (!user_id || !api_key || typeof api_key !== "string") {
    return NextResponse.json(
      { error: "user_id e api_key obrigatórios" },
      { status: 400 }
    )
  }

  const provider = parseProvider(rawProvider)

  try {
    await validateProviderApiKey(provider, api_key)
    await saveUserAiCredentials(user_id, provider, api_key)
    const status = await getUserAiCredentialsStatus(user_id)
    return NextResponse.json(status)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao salvar chave"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    await deleteUserAiCredentials(user_id)
    return NextResponse.json({ configured: false })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
