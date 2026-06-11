import { NextResponse } from "next/server"
import { bulkLinkAssetToQuestions } from "@/lib/shared-assets"

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, asset_id, question_ids } = body as {
    user_id: string
    asset_id: string
    question_ids: string[]
  }

  if (!user_id || !asset_id || !Array.isArray(question_ids)) {
    return NextResponse.json(
      { error: "user_id, asset_id e question_ids são obrigatórios" },
      { status: 400 }
    )
  }

  const uniqueIds = [...new Set(question_ids.filter((id) => typeof id === "string" && id))]
  if (!uniqueIds.length) {
    return NextResponse.json({ error: "Nenhuma questão informada" }, { status: 400 })
  }

  try {
    const linked = await bulkLinkAssetToQuestions(asset_id, user_id, uniqueIds)
    return NextResponse.json({ ok: true, linked })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    )
  }
}
