import { NextResponse } from "next/server"
import { uploadCoachDocument, type CoachDocType } from "@/lib/coach-documents"
import { COACH_UPLOAD_MAX_BYTES, COACH_UPLOAD_MAX_LABEL } from "@/lib/coach-upload-limits"
import { supabaseServer } from "@/lib/supabase-server"
import { enqueueJob } from "@/lib/ai/jobs/queue"

export const runtime = "nodejs"
export const maxDuration = 60

function enqueueMaterialIngest(userId: string, documentId: string) {
  return enqueueJob({
    userId,
    jobType: "document_ingest",
    idempotencyKey: `ingest:${documentId}:v2`,
    payload: { document_id: documentId },
    priority: 6,
  })
}

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const user_id = form.get("user_id") as string | null
    const doc_type = form.get("doc_type") as CoachDocType | null
    const subject_id = (form.get("subject_id") as string) || null
    const exam_target_id = (form.get("exam_target_id") as string) || null

    if (!user_id || !doc_type) {
      return NextResponse.json(
        { error: "user_id e doc_type obrigatórios" },
        { status: 400 }
      )
    }

    if (doc_type === "study_material" && !subject_id) {
      return NextResponse.json(
        { error: "subject_id obrigatório para material de estudo" },
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

    const files: File[] = []
    const multi = form.getAll("files")
    if (multi.length) {
      for (const f of multi) {
        if (f instanceof File && f.size > 0) files.push(f)
      }
    }
    const single = form.get("file")
    if (single instanceof File && single.size > 0) {
      files.push(single)
    }

    if (!files.length) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })
    }

    if (doc_type === "study_material" && files.length > 1) {
      return NextResponse.json(
        {
          error:
            "Envie apenas um PDF por requisição (limite da Vercel). O app envia vários arquivos em sequência.",
        },
        { status: 400 }
      )
    }

    const uploaded: Record<string, unknown>[] = []
    const documentIds: string[] = []
    const errors: { file: string; error: string }[] = []

    for (const file of files) {
      if (file.size > COACH_UPLOAD_MAX_BYTES) {
        errors.push({
          file: file.name,
          error: `Máximo ${COACH_UPLOAD_MAX_LABEL} por arquivo nesta hospedagem.`,
        })
        continue
      }
      const title =
        (form.get(`title_${file.name}`) as string) ||
        (form.get("title") as string) ||
        file.name

      let doc: Record<string, unknown>
      try {
        doc = (await uploadCoachDocument({
          userId: user_id,
          file,
          docType: doc_type,
          title,
          subjectId: subject_id,
          subjectName,
          examTargetId: exam_target_id,
        })) as Record<string, unknown>
      } catch (uploadErr) {
        const msg =
          uploadErr instanceof Error ? uploadErr.message : "Falha no upload"
        errors.push({ file: file.name, error: msg })
        continue
      }

      const docId = doc.id as string
      const row = doc as Record<string, unknown>
      uploaded.push({
        id: docId,
        title: row.title,
        doc_type: row.doc_type,
        status: row.status,
        ingest_stage: row.ingest_stage,
        duplicate: Number(row.chunk_count ?? 0) > 0,
      })

      if (doc_type === "study_material" && docId) {
        documentIds.push(docId)
      }
    }

    if (documentIds.length === 1) {
      await enqueueMaterialIngest(user_id, documentIds[0]!)
    } else if (documentIds.length > 1) {
      await enqueueJob({
        userId: user_id,
        jobType: "document_batch_ingest",
        idempotencyKey: `batch:${subject_id}:${Date.now()}`,
        payload: { document_ids: documentIds, subject_id },
        priority: 6,
      })
    }

    return NextResponse.json({
      uploaded,
      count: uploaded.length,
      document_ids: documentIds,
      errors: errors.length ? errors : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    console.error("[coach/documents/upload]", msg, e)
    if (msg.includes("too large") || msg.includes("FUNCTION_PAYLOAD")) {
      return NextResponse.json(
        {
          error: `Arquivo grande demais para o servidor (máx. ~${COACH_UPLOAD_MAX_LABEL} por PDF). Envie um arquivo por vez.`,
        },
        { status: 413 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
