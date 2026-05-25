import { NextResponse } from "next/server"
import { fetchIncidenceRows, resolveSubjectLabels } from "@/lib/incidence-rows-db"
import { getExamIncidenceWorkbook } from "@/lib/coach-documents"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const exam_target_id = searchParams.get("exam_target_id")
  const subject_id = searchParams.get("subject_id")
  const limit = searchParams.get("limit")

  if (!user_id || !exam_target_id) {
    return NextResponse.json(
      { error: "user_id e exam_target_id obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const rows = await fetchIncidenceRows({
      userId: user_id,
      examTargetId: exam_target_id,
      subjectId: subject_id,
      limit: limit ? Number(limit) : undefined,
    })

    const wb = await getExamIncidenceWorkbook(user_id, exam_target_id)
    const pt = (wb?.parsed_tables ?? {}) as {
      parse_stats?: Record<string, unknown>
      merge_warnings?: unknown[]
    }

    let subject_labels: string[] = []
    if (subject_id) {
      subject_labels = await resolveSubjectLabels(
        user_id,
        exam_target_id,
        subject_id
      )
    }

    return NextResponse.json({
      rows,
      stats: pt.parse_stats ?? null,
      merge_warnings: pt.merge_warnings ?? [],
      subject_labels,
      total: rows.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
