import { NextResponse } from "next/server"
import { runTeacherAgent } from "@/lib/ai/agents/teacher"

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const user_id = body.user_id as string
    const subject_id = body.subject_id as string
    const query = (body.query as string)?.trim()

    if (!user_id || !subject_id || !query) {
      return NextResponse.json(
        { error: "user_id, subject_id e query obrigatórios" },
        { status: 400 }
      )
    }

    const answer = await runTeacherAgent({
      userId: user_id,
      subjectId: subject_id,
      query,
      questionContext: body.context as Record<string, unknown> | undefined,
    })

    return NextResponse.json({ answer })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
