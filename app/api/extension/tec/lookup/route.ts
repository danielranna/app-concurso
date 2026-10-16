import { NextResponse } from "next/server"
import { parseTecIds, isUuid, extensionCorsHeaders } from "@/lib/extension-tec"
import { fetchBankQuestionsByTecIds } from "@/lib/question-import"
import { supabaseServer } from "@/lib/supabase-server"

export const runtime = "nodejs"

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: extensionCorsHeaders })
}

async function requireUser(userId: unknown) {
  const id = String(userId || "")
  if (!isUuid(id)) return { error: "Usuário inválido." as const }
  const { data, error } = await supabaseServer.auth.admin.getUserById(id)
  if (error || !data?.user) return { error: "Faça login no app de novo." as const }
  return { userId: id }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { user_id?: string; tec_ids?: unknown }
    const user = await requireUser(body.user_id)
    if ("error" in user) {
      return NextResponse.json({ error: user.error }, { status: 401, headers: extensionCorsHeaders })
    }

    const tecIds = parseTecIds(body.tec_ids)
    const found = await fetchBankQuestionsByTecIds(tecIds)
    return NextResponse.json(
      {
        found: [...found.entries()].map(([tec_id, question]) => ({
          tec_id,
          question_id: question.id,
        })),
      },
      { headers: extensionCorsHeaders }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar"
    const status = message.includes("máximo") || message.includes("lista") ? 400 : 500
    return NextResponse.json({ error: message }, { status, headers: extensionCorsHeaders })
  }
}
