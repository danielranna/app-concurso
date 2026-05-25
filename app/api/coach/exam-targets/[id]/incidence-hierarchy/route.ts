import { NextResponse } from "next/server"
import { getExamIncidenceHierarchy } from "@/lib/coach-documents"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const user_id = searchParams.get("user_id")
    if (!user_id) {
      return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
    }

    const payload = await getExamIncidenceHierarchy(user_id, id)
    if (!payload) {
      return NextResponse.json({
        exam_target_id: id,
        document_id: null,
        subjects: [],
        parse_stats: null,
      })
    }

    return NextResponse.json(payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
