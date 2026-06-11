import { NextResponse } from "next/server"
import {
  loadQuestionAssetLinks,
  saveQuestionAssetLinks,
  type QuestionAssetLink,
} from "@/lib/shared-assets"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: questionId } = await params
  const userId = new URL(req.url).searchParams.get("user_id")
  if (!userId) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const links = await loadQuestionAssetLinks(questionId, userId)
    return NextResponse.json({ links })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: questionId } = await params
  const body = await req.json()
  const { user_id, links } = body as {
    user_id: string
    links: QuestionAssetLink[]
  }

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }
  if (!Array.isArray(links)) {
    return NextResponse.json({ error: "links deve ser um array" }, { status: 400 })
  }

  const normalized = links.map((l, i) => ({
    assetId: l.assetId,
    sortOrder: l.sortOrder ?? i,
    contentOverride: l.contentOverride ?? null,
  }))

  try {
    await saveQuestionAssetLinks(questionId, user_id, normalized)
    const saved = await loadQuestionAssetLinks(questionId, user_id)
    return NextResponse.json({ ok: true, links: saved })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    )
  }
}
