import { NextResponse } from "next/server"
import {
  bulkMoveTecSubjectNodes,
  createTecFolder,
  deleteTecSubjectNode,
  deleteTopicNodesAndBankQuestions,
  fetchTecSubjectTree,
  listTecSubjectSummaries,
  seedTecSubjectTopicsFromBank,
  updateTecSubjectNode,
} from "@/lib/tec-subject-tree"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const tec_subject = searchParams.get("tec_subject")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (tec_subject) {
      const tree = await fetchTecSubjectTree(user_id, tec_subject)
      return NextResponse.json(tree)
    }
    const summaries = await listTecSubjectSummaries(user_id)
    return NextResponse.json(summaries)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, action, tec_subject, name, parent_id, node_ids } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (action === "seed" && tec_subject) {
      const result = await seedTecSubjectTopicsFromBank(user_id, tec_subject)
      const tree = await fetchTecSubjectTree(user_id, tec_subject)
      return NextResponse.json({ ...result, tree })
    }

    if (action === "create_folder" && tec_subject && name) {
      const node = await createTecFolder(user_id, tec_subject, name, parent_id ?? null)
      return NextResponse.json({ node })
    }

    if (action === "delete_topic_questions" && tec_subject && Array.isArray(node_ids)) {
      const result = await deleteTopicNodesAndBankQuestions(
        user_id,
        tec_subject,
        node_ids as string[]
      )
      const tree = await fetchTecSubjectTree(user_id, tec_subject)
      return NextResponse.json({ ...result, tree })
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { user_id, node_id, node_ids, name, parent_id, sort_order } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (Array.isArray(node_ids) && node_ids.length > 0) {
      const result = await bulkMoveTecSubjectNodes(
        user_id,
        node_ids as string[],
        parent_id ?? null
      )
      return NextResponse.json({ ok: true, ...result })
    }

    if (!node_id) {
      return NextResponse.json({ error: "node_id ou node_ids obrigatório" }, { status: 400 })
    }

    await updateTecSubjectNode(user_id, node_id, { name, parent_id, sort_order })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const node_id = searchParams.get("node_id")

  if (!user_id || !node_id) {
    return NextResponse.json({ error: "user_id e node_id obrigatórios" }, { status: 400 })
  }

  try {
    await deleteTecSubjectNode(user_id, node_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
