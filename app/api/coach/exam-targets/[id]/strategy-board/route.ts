import { NextResponse } from "next/server"
import { buildExamStrategyBoard } from "@/lib/ai/exam-strategy-board"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const refresh = searchParams.get("refresh") === "1"

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const board = await buildExamStrategyBoard(user_id, id, {
      refreshQueue: refresh,
    })
    return NextResponse.json(board)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
