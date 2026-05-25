import { NextResponse } from "next/server"
import {
  fetchEditalSubjectRank,
  listIncidenceLabelsFromWorkbook,
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
      listIncidenceLabelsFromWorkbook(user_id, id).catch(() => [] as string[]),
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

    const incidence_subject_labels = Array.isArray(body.incidence_subject_labels)
      ? (body.incidence_subject_labels as string[])
      : undefined
    const subject_ids = Array.isArray(body.subject_ids)
      ? (body.subject_ids as string[])
      : undefined

    if (
      incidence_subject_labels === undefined &&
      subject_ids === undefined
    ) {
      return NextResponse.json(
        { error: "incidence_subject_labels ou subject_ids obrigatório" },
        { status: 400 }
      )
    }

    const row = await updateEditalSubjectRankMapping(user_id, rank_id, {
      incidence_subject_labels,
      subject_ids,
    })

    return NextResponse.json({
      row: {
        id: row.id,
        subject_name: row.subject_name,
        priority: row.priority,
        incidence_subject_labels: row.incidence_subject_labels,
        subject_ids: row.subject_ids,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
