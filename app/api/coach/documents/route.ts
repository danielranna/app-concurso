import { NextResponse } from "next/server"
import { listCoachDocuments } from "@/lib/coach-documents"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const exam_target_id = searchParams.get("exam_target_id")
  const subject_id = searchParams.get("subject_id")
  const doc_type = searchParams.get("doc_type") as
    | "edital"
    | "incidence"
    | "strategic_md"
    | null

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const docs = await listCoachDocuments(user_id, {
      examTargetId: exam_target_id ?? undefined,
      subjectId: subject_id ?? undefined,
      docType: doc_type ?? undefined,
    })
    return NextResponse.json(docs)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
