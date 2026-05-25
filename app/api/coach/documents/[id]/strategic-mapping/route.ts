import { NextResponse } from "next/server"
import { setStrategicSlugOverride } from "@/lib/strategic-md-import"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const user_id = body.user_id as string
    const slug = body.slug as string
    let subject_ids: string[] = []

    if (Array.isArray(body.subject_ids)) {
      subject_ids = body.subject_ids.filter(Boolean)
    } else if (body.subject_id != null && body.subject_id !== "") {
      subject_ids = [body.subject_id as string]
    }

    if (!user_id || !slug) {
      return NextResponse.json(
        { error: "user_id e slug obrigatórios" },
        { status: 400 }
      )
    }

    const doc = await setStrategicSlugOverride({
      userId: user_id,
      documentId: id,
      slug,
      subjectIds: subject_ids,
    })

    return NextResponse.json(doc)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
