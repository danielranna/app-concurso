import { NextResponse } from "next/server"
import { analyzeExamEdital } from "@/lib/ai/edital-analysis"

export const maxDuration = 300

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const user_id = body.user_id as string

    if (!user_id) {
      return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
    }

    const result = await analyzeExamEdital(user_id, id)
    return NextResponse.json(result)
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Erro"
    if (/rate limit|tokens per min|TPM|too large/i.test(raw)) {
      return NextResponse.json(
        {
          error:
            "Limite de tokens da OpenAI (30 mil/min). Aguarde cerca de 1 minuto e clique em Analisar de novo. Se repetir, o PDF pode estar muito longo — tente só o edital (sem anexos repetidos).",
        },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: raw }, { status: 500 })
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { getExamEditalAnalysis } = await import("@/lib/ai/edital-analysis")
  const data = await getExamEditalAnalysis(user_id, id)
  return NextResponse.json({ analysis: data })
}
