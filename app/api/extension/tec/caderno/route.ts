import { NextResponse } from "next/server"
import { extensionCorsHeaders, isUuid } from "@/lib/extension-tec"
import { syncTecCadernoCopy } from "@/lib/extension-tec-caderno"
import { supabaseServer } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const maxDuration = 120

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: extensionCorsHeaders })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      user_id?: string
      tec_caderno_id?: string
      name?: string
      materia?: string
      assunto?: string
      total?: number
      resolved?: number
      finish?: boolean
      create?: boolean
      question_id?: string
      selected_answer?: string
      confidence_level?: string
      note_draft?: string
      ai_requested?: boolean
      explain_requested?: boolean
      duration_ms?: number | null
    }
    const userId = String(body.user_id || "")
    const tecCadernoId = String(body.tec_caderno_id || "").replace(/\D/g, "")
    if (!isUuid(userId)) {
      return NextResponse.json({ error: "Usuário inválido." }, { status: 401, headers: extensionCorsHeaders })
    }
    if (!tecCadernoId) {
      return NextResponse.json({ error: "Caderno do TEC ausente." }, { status: 400, headers: extensionCorsHeaders })
    }
    const { data, error } = await supabaseServer.auth.admin.getUserById(userId)
    if (error || !data?.user) {
      return NextResponse.json(
        { error: "Faça login no app de novo." },
        { status: 401, headers: extensionCorsHeaders }
      )
    }

    const result = await syncTecCadernoCopy({
      userId,
      tecCadernoId,
      name: body.name,
      materia: body.materia,
      assunto: body.assunto,
      total: body.total,
      resolved: body.resolved,
      finish: body.finish,
      create: body.create === true,
      questionId: body.question_id,
      selectedAnswer: body.selected_answer,
      confidenceLevel: body.confidence_level,
      noteDraft: body.note_draft,
      aiRequested: body.ai_requested,
      explainRequested: body.explain_requested === true,
      durationMs: body.duration_ms,
    })
    return NextResponse.json(result, { headers: extensionCorsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao copiar o caderno"
    return NextResponse.json({ error: message }, { status: 500, headers: extensionCorsHeaders })
  }
}
