import { NextResponse } from "next/server"
import { reparseStrategicDocument } from "@/lib/strategic-md-import"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const user_id = body.user_id as string
    const exam_target_id = body.exam_target_id as string

    if (!user_id || !exam_target_id) {
      return NextResponse.json(
        { error: "user_id e exam_target_id obrigatórios" },
        { status: 400 }
      )
    }

    const result = await reparseStrategicDocument({
      userId: user_id,
      documentId: id,
      examTargetId: exam_target_id,
    })

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
