import { NextResponse } from "next/server"
import {
  fetchEditalSubjectRank,
  listIncidenceLabelsForExam,
  updateEditalSubjectRankMapping,
} from "@/lib/edital-subject-rank-db"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const [rows, incidence_labels] = await Promise.all([
      fetchEditalSubjectRank(user_id, id),
      listIncidenceLabelsForExam(user_id, id).catch(() => [] as string[]),
    ])

    const { data: subjects } = await supabaseServer
      .from("subjects")
      .select("id, name")
      .eq("user_id", user_id)
      .order("name")

    return NextResponse.json({
      rows,
      incidence_labels,
      subjects: subjects ?? [],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: examTargetId } = await params
    const body = await req.json()
    const user_id = body.user_id as string
    const rank_id = body.rank_id as string

    if (!user_id || !rank_id) {
      return NextResponse.json(
        { error: "user_id e rank_id obrigatórios" },
        { status: 400 }
      )
    }

    const row = await updateEditalSubjectRankMapping(user_id, rank_id, {
      incidence_subject_label:
        body.incidence_subject_label === undefined
          ? undefined
          : body.incidence_subject_label || null,
      subject_id:
        body.subject_id === undefined ? undefined : body.subject_id || null,
    })

    return NextResponse.json({ row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
