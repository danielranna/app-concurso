import { NextResponse } from "next/server"
import { uploadCoachDocument, type CoachDocType } from "@/lib/coach-documents"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const user_id = form.get("user_id") as string | null
    const doc_type = form.get("doc_type") as CoachDocType | null
    const title = (form.get("title") as string) || ""
    const subject_id = (form.get("subject_id") as string) || null
    const exam_target_id = (form.get("exam_target_id") as string) || null
    const file = form.get("file") as File | null

    if (!user_id || !doc_type || !file) {
      return NextResponse.json(
        { error: "user_id, doc_type e file obrigatórios" },
        { status: 400 }
      )
    }

    if (doc_type === "edital" && !exam_target_id) {
      return NextResponse.json(
        { error: "exam_target_id obrigatório para edital" },
        { status: 400 }
      )
    }

    if (doc_type === "incidence" && !subject_id) {
      return NextResponse.json(
        { error: "subject_id obrigatório para incidência" },
        { status: 400 }
      )
    }

    const doc = await uploadCoachDocument({
      userId: user_id,
      file,
      docType: doc_type,
      title: title || file.name,
      subjectId: subject_id,
      examTargetId: exam_target_id,
    })

    return NextResponse.json(doc)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
