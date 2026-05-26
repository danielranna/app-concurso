import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { isMissingLibrarySavedColumn } from "@/lib/notebook-library-saved"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data: notebook, error } = await supabaseServer
    .from("notebooks")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: items } = await supabaseServer
    .from("notebook_questions")
    .select(
      `
      position,
      question_id,
      questions (*)
    `
    )
    .eq("notebook_id", id)
    .order("position")

  return NextResponse.json({ notebook, questions: items ?? [] })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { name, folder_id, subject_id, library_saved } = body

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name != null) update.name = name
  if (folder_id !== undefined) update.folder_id = folder_id
  if (subject_id !== undefined) update.subject_id = subject_id
  if (library_saved !== undefined) update.library_saved = library_saved

  let { data, error } = await supabaseServer
    .from("notebooks")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error && library_saved !== undefined && isMissingLibrarySavedColumn(error)) {
    const { library_saved: _drop, ...withoutCol } = update
    const retry = await supabaseServer
      .from("notebooks")
      .update(withoutCol)
      .eq("id", id)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { error } = await supabaseServer.from("notebooks").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
