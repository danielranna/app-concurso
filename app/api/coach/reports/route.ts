import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { enqueueNotebookReport } from "@/lib/ai/notebook-report"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")
  const notebook_id = searchParams.get("notebook_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  let query = supabaseServer
    .from("subject_notebook_reports")
    .select(
      `
      id, notebook_id, subject_id, summary_md, structured,
      model_used, created_at,
      notebooks ( name, question_count )
    `
    )
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })

  if (subject_id) query = query.eq("subject_id", subject_id)
  if (notebook_id) query = query.eq("notebook_id", notebook_id)

  const { data, error } = await query.limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, notebook_id, force } = body

  if (!user_id || !notebook_id) {
    return NextResponse.json(
      { error: "user_id e notebook_id obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const result = await enqueueNotebookReport(notebook_id, user_id, {
      force: Boolean(force),
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
