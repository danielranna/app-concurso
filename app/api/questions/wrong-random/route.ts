import { NextResponse } from "next/server"
import {
  listWrongQuestionIds,
  loadRandomWrongQuestion,
} from "@/lib/wrong-questions-random"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  const exclude = url.searchParams.get("exclude") ?? undefined
  const countOnly = url.searchParams.get("count_only") === "1"

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (countOnly) {
      const ids = await listWrongQuestionIds(user_id)
      return NextResponse.json({ pool_count: ids.length })
    }

    const data = await loadRandomWrongQuestion(user_id, exclude)
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
