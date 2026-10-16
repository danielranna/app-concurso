import { NextResponse } from "next/server"
import { isUuid, toImportQuestion } from "@/lib/extension-tec"
import { upsertGlobalQuestion } from "@/lib/question-import"
import { supabaseServer } from "@/lib/supabase-server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { user_id?: string; question?: unknown }
    const userId = String(body.user_id || "")
    if (!isUuid(userId)) {
      return NextResponse.json({ error: "Usuário inválido." }, { status: 401 })
    }
    const { data, error } = await supabaseServer.auth.admin.getUserById(userId)
    if (error || !data?.user) {
      return NextResponse.json({ error: "Faça login no app de novo." }, { status: 401 })
    }

    const question = toImportQuestion(body.question)
    const result = await upsertGlobalQuestion(question)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gravar"
    const status = /gabarito|enunciado|alternativa|inválid|tec_id/i.test(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
