import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user_id = new URL(req.url).searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("subject_notebook_reports")
    .select(
      `
      id, notebook_id, subject_id, summary_md, structured,
      model_used, tokens_in, tokens_out, cost_usd_estimate, created_at,
      notebooks ( name, question_count, completed_at )
    `
    )
    .eq("id", id)
    .eq("user_id", user_id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 })
  }

  return NextResponse.json(data)
}
