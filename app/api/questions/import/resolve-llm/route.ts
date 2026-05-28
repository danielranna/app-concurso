import { NextResponse } from "next/server"
import {
  IMPORT_LLM_ENABLED,
  resolveQuestionWithLlm,
  type LlmResolveInput,
} from "@/lib/tec-pdf-parse-llm"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    if (!IMPORT_LLM_ENABLED) {
      return NextResponse.json(
        { error: "Resolução por IA desabilitada neste ambiente." },
        { status: 503 }
      )
    }

    const body = (await req.json()) as {
      user_id: string
      raw_block: string
      candidates: LlmResolveInput["candidates"]
    }

    if (!body.user_id || !body.raw_block) {
      return NextResponse.json(
        { error: "user_id e raw_block são obrigatórios" },
        { status: 400 }
      )
    }

    const result = await resolveQuestionWithLlm(body.user_id, {
      raw_block: body.raw_block,
      candidates: body.candidates ?? {},
    })

    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro na resolução por IA"
    console.error("[import/resolve-llm]", message, e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
