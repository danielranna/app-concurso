import { NextResponse } from "next/server"
import { getSyncForNotebook, resolveJidByUserId, fetchQuizInventory } from "@/lib/quiz-sync"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(req.url)
  const userId = url.searchParams.get("user_id")
  if (!userId) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }
  const sync = await getSyncForNotebook(id)
  const { data: replica } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("source_notebook_id")
    .eq("notebook_id", id)
    .eq("user_id", userId)
    .maybeSingle()
  const sourceId = replica?.source_notebook_id ?? (sync ? id : null)
  const enabled = Boolean(sync || replica)
  const questionId = url.searchParams.get("question_id")
  let shortId: string | null = null
  let syncedComment: string | null = null
  if (questionId) {
    const linkNb = sourceId ?? id
    const { data: link } = await supabaseServer
      .from("quiz_question_links")
      .select("short_id")
      .eq("notebook_id", linkNb)
      .eq("question_id", questionId)
      .maybeSingle()
    shortId = link?.short_id ?? null
    const { data: note } = await supabaseServer
      .from("question_note_entries")
      .select("body")
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .eq("sync_origin", "whatsapp")
      .maybeSingle()
    syncedComment = note?.body ?? null
  }
  const jid = await resolveJidByUserId(userId)
  let inventory = { assistEliminateQty: 0, categories: [] as { id: number; name: string }[] }
  if (jid && enabled) {
    inventory = await fetchQuizInventory(jid)
  }
  return NextResponse.json({
    enabled,
    caderno_id: sync?.caderno_id ?? null,
    source_notebook_id: sourceId,
    short_id: shortId,
    synced_comment: syncedComment,
    jid,
    assistEliminateQty: inventory.assistEliminateQty ?? 0,
    categories: inventory.categories ?? [],
  })
}
