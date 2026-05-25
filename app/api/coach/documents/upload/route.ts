import { NextResponse } from "next/server"
import { uploadCoachDocument, type CoachDocType } from "@/lib/coach-documents"
import { supabaseServer } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const maxDuration = 120

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

    if (doc_type === "incidence" && !exam_target_id) {
      return NextResponse.json(
        { error: "exam_target_id obrigatório para incidência" },
        { status: 400 }
      )
    }

    let subjectName: string | null = null
    if (subject_id) {
      const { data: sub } = await supabaseServer
        .from("subjects")
        .select("name")
        .eq("id", subject_id)
        .single()
      subjectName = sub?.name ?? null
    }

    const doc = await uploadCoachDocument({
      userId: user_id,
      file,
      docType: doc_type,
      title: title || file.name,
      subjectId: subject_id,
      subjectName,
      examTargetId: exam_target_id,
    })

    if (doc_type === "study_material" && doc.id) {
      const { enqueueJob } = await import("@/lib/ai/jobs/queue")
      const { runJobWorker } = await import("@/lib/ai/jobs/worker")
      await enqueueJob({
        userId: user_id,
        jobType: "document_ingest",
        idempotencyKey: `ingest:${doc.id}`,
        payload: { document_id: doc.id },
        priority: 5,
      })
      runJobWorker(1).catch(() => {})
    }

    const pt = (doc.parsed_tables ?? {}) as Record<string, unknown>
    return NextResponse.json({
      id: doc.id,
      title: doc.title,
      doc_type: doc.doc_type,
      exam_target_id: doc.exam_target_id,
      status: doc.status,
      created_at: doc.created_at,
      parsed_tables: {
        format: pt.format,
        scope: pt.scope,
        parse_stats: pt.parse_stats,
        block_count: pt.block_count,
        flat_row_count: pt.flat_row_count,
        persist_error: (pt.parse_stats as { persist_error?: string } | undefined)
          ?.persist_error,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    console.error("[coach/documents/upload]", msg, e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
