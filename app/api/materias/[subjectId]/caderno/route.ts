import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { emptyNotebookDocument } from "@/lib/blocknote/helpers"
import { normalizeNotebookDocument } from "@/lib/blocknote/migrate"
import type { StoredNotebookDocument } from "@/lib/blocknote/types"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("subject_user_notebooks")
    .select("document, updated_at")
    .eq("user_id", user_id)
    .eq("subject_id", subjectId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({
      document: emptyNotebookDocument(),
      updated_at: null,
    })
  }

  const document = normalizeNotebookDocument(data.document)

  return NextResponse.json({
    document,
    updated_at: data.updated_at,
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params
  const body = await req.json()
  const { user_id, document } = body

  if (!user_id || !document) {
    return NextResponse.json(
      { error: "user_id e document obrigatórios" },
      { status: 400 }
    )
  }

  const normalized = normalizeNotebookDocument(document) as StoredNotebookDocument

  const { data, error } = await supabaseServer
    .from("subject_user_notebooks")
    .upsert(
      {
        user_id,
        subject_id: subjectId,
        document: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,subject_id" }
    )
    .select("updated_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ updated_at: data.updated_at })
}
