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
    const subject_id = (body.subject_id as string | null) ?? null

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
      subjectId: subject_id,
    })

    return NextResponse.json(doc)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
