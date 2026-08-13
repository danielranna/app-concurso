import { NextResponse } from "next/server"
import { fetchQuizInventory, resolveJidByUserId } from "@/lib/quiz-sync"

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id") || ""
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }
  const jid = await resolveJidByUserId(user_id)
  if (!jid) {
    return NextResponse.json({ assistEliminateQty: 0, categories: [], jid: null })
  }
  const inventory = await fetchQuizInventory(jid)
  return NextResponse.json({ ...inventory, jid })
}
