import { NextResponse } from "next/server"
import {
  countPendingMaterialIngest,
  userHasRunningDocumentJob,
} from "@/lib/ai/jobs/document-ingest-worker"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("user_id")?.trim()
    if (!userId) {
      return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
    }

    const [pending_count, running] = await Promise.all([
      countPendingMaterialIngest(userId),
      userHasRunningDocumentJob(userId),
    ])

    return NextResponse.json({
      pending_count,
      running,
      active: pending_count > 0 || running,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
