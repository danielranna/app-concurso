import { NextResponse } from "next/server"
import { setIncidenceBlockOverride } from "@/lib/coach-documents"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const user_id = body.user_id as string | undefined
    const excel_label = body.excel_label as string | undefined
    const subject_id =
      body.subject_id === null || body.subject_id === ""
        ? null
        : (body.subject_id as string | undefined)

    if (!user_id || !excel_label) {
      return NextResponse.json(
        { error: "user_id e excel_label obrigatórios" },
        { status: 400 }
      )
    }

    if (subject_id === undefined) {
      return NextResponse.json(
        { error: "subject_id obrigatório (use null para remover vínculo)" },
        { status: 400 }
      )
    }

    const doc = await setIncidenceBlockOverride({
      userId: user_id,
      documentId: id,
      excelLabel: excel_label,
      subjectId: subject_id,
    })

    return NextResponse.json(doc)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
