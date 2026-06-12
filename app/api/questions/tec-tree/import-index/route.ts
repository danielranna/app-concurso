import { NextResponse } from "next/server"
import {
  buildNotebookIndexPreviewFromBuffers,
  previewToApplyPayload,
  type NotebookIndexPreview,
} from "@/lib/tec-notebook-index-import"
import {
  applyNotebookIndexHierarchy,
  fetchTecSubjectTree,
  listTecTopicNodesForSubject,
  seedTecSubjectTopicsFromBank,
} from "@/lib/tec-subject-tree"

export const runtime = "nodejs"

const MAX_BYTES = 15 * 1024 * 1024

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const user_id = String(form.get("user_id") ?? "")
    const tec_subject = String(form.get("tec_subject") ?? "")
    const action = String(form.get("action") ?? "preview")

    if (!user_id || !tec_subject) {
      return NextResponse.json(
        { error: "user_id e tec_subject são obrigatórios" },
        { status: 400 }
      )
    }

    if (action === "apply") {
      const previewJson = form.get("preview")
      const confirmedRaw = form.get("confirmed_node_ids")
      if (!previewJson || typeof previewJson !== "string") {
        return NextResponse.json({ error: "preview é obrigatório no apply" }, { status: 400 })
      }

      const preview = JSON.parse(previewJson) as NotebookIndexPreview
      const confirmedIds = new Set<string>(
        confirmedRaw && typeof confirmedRaw === "string"
          ? (JSON.parse(confirmedRaw) as string[])
          : preview.matches.filter((m) => m.default_confirmed).map((m) => m.db_node_id)
      )

      const { folders, matches } = previewToApplyPayload(preview, confirmedIds)
      const result = await applyNotebookIndexHierarchy(
        user_id,
        tec_subject,
        folders,
        matches
      )
      const tree = await fetchTecSubjectTree(user_id, tec_subject)

      return NextResponse.json({ ...result, tree })
    }

    const files = form
      .getAll("file")
      .filter((entry): entry is File => entry instanceof File)

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Envie um ou mais arquivos Excel (.xlsx ou .xls)" },
        { status: 400 }
      )
    }

    for (const file of files) {
      const name = file.name.toLowerCase()
      if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
        return NextResponse.json(
          { error: `Arquivo inválido: ${file.name}. Use .xlsx ou .xls` },
          { status: 400 }
        )
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `Arquivo muito grande (máx. 15 MB): ${file.name}` },
          { status: 400 }
        )
      }
    }

    const syncFirst = form.get("sync_first") === "1"
    if (syncFirst) {
      await seedTecSubjectTopicsFromBank(user_id, tec_subject)
    }

    const parts = await Promise.all(
      files.map(async (file) => ({
        buffer: Buffer.from(await file.arrayBuffer()),
        fileName: file.name,
      }))
    )

    const ungroupedOnly = form.get("ungrouped_only") !== "0"
    const dbTopics = await listTecTopicNodesForSubject(user_id, tec_subject, {
      ungroupedOnly,
    })

    if (dbTopics.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhum assunto no banco para esta matéria. Clique em “Importar assuntos do banco” antes ou marque sincronizar.",
        },
        { status: 400 }
      )
    }

    const preview = buildNotebookIndexPreviewFromBuffers(parts, tec_subject, dbTopics)
    return NextResponse.json(preview)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao importar índice"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
