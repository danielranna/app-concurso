import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const byTec = searchParams.get("by") === "tec"

  let query = supabaseServer.from("questions").select("*")
  if (byTec) {
    query = query.eq("tec_id", parseInt(id, 10))
  } else {
    query = query.eq("id", id)
  }

  const { data: question, error } = await query.maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!question) return NextResponse.json({ error: "Não encontrada" }, { status: 404 })

  const { data: options } = await supabaseServer
    .from("question_options")
    .select("*")
    .eq("question_id", question.id)
    .order("sort_order")

  return NextResponse.json({ question, options: options ?? [] })
}
