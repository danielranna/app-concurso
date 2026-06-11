import { NextResponse } from "next/server"
import {
  createContentGroup,
  deleteContentNode,
  deleteNodeIncidence,
  fetchContentTree,
  getContentNode,
  updateContentNode,
  upsertNodeIncidence,
} from "@/lib/content-index-db"
import { syncSubjectContentIndex } from "@/lib/content-index-sync"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")
  const node_id = searchParams.get("node_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (node_id) {
      const node = await getContentNode(user_id, node_id)
      if (!node) {
        return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 })
      }
      return NextResponse.json({ node })
    }

    if (!subject_id) {
      return NextResponse.json({ error: "subject_id obrigatório" }, { status: 400 })
    }

    const tree = await fetchContentTree(user_id, subject_id)
    return NextResponse.json(tree)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, action, subject_id, name, parent_id, node_id, banca, percent, notes } =
    body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (action === "sync" && subject_id) {
      const result = await syncSubjectContentIndex(user_id, subject_id)
      const tree = await fetchContentTree(user_id, subject_id)
      return NextResponse.json({ ...result, tree })
    }

    if (action === "create_group" && subject_id && name) {
      const node = await createContentGroup(user_id, subject_id, name, parent_id ?? null)
      return NextResponse.json({ node })
    }

    if (action === "upsert_incidence" && node_id && banca) {
      await upsertNodeIncidence(user_id, node_id, banca, Number(percent ?? 0), notes)
      const node = await getContentNode(user_id, node_id)
      return NextResponse.json({ node })
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { user_id, node_id, name, parent_id, sort_order, notebook_id } = body

  if (!user_id || !node_id) {
    return NextResponse.json({ error: "user_id e node_id obrigatórios" }, { status: 400 })
  }

  try {
    await updateContentNode(user_id, node_id, {
      name,
      parent_id,
      sort_order,
      notebook_id,
    })
    const node = await getContentNode(user_id, node_id)
    return NextResponse.json({ node })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const node_id = searchParams.get("node_id")
  const incidence_id = searchParams.get("incidence_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (incidence_id) {
      await deleteNodeIncidence(user_id, incidence_id)
      return NextResponse.json({ ok: true })
    }
    if (node_id) {
      await deleteContentNode(user_id, node_id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "node_id ou incidence_id obrigatório" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
