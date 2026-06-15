import { NextResponse } from "next/server"
import {
  addTopicToContentBlock,
  addTopicsToContentBlock,
  createContentBlock,
  deleteContentBlock,
  ensureDraftCycle,
  getTecTopicTreeForSubject,
  getTecTopicsForSubject,
  loadContentBlocksForCycle,
  removeTopicFromContentBlock,
  saveCycleSubjects,
  updateContentBlock,
} from "@/lib/study-cycle-content-blocks-db"
import { getActiveOrDraftCycle } from "@/lib/study-cycle-db"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const cycle_id = searchParams.get("cycle_id")
  const subject_id = searchParams.get("subject_id")
  const tec_topics = searchParams.get("tec_topics")
  const tec_tree = searchParams.get("tec_tree")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (tec_tree && subject_id) {
      const result = await getTecTopicTreeForSubject(user_id, subject_id)
      return NextResponse.json(result)
    }

    if (tec_topics && subject_id) {
      const topics = await getTecTopicsForSubject(user_id, subject_id)
      return NextResponse.json({ topics })
    }

    let cid = cycle_id
    if (!cid) {
      const cycle = await getActiveOrDraftCycle(user_id)
      cid = cycle?.id ?? null
    }
    if (!cid) {
      return NextResponse.json({ blocks: [] })
    }

    const blocks = await loadContentBlocksForCycle(cid)
    const filtered = subject_id
      ? blocks.filter((b) => b.subject_id === subject_id)
      : blocks

    return NextResponse.json({ blocks: filtered, cycle_id: cid })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const {
    user_id,
    action,
    cycle_id,
    subject_id,
    name,
    sort_order,
    estimated_minutes,
    block_id,
    tec_subject,
    tec_topic,
    topic_id,
    topics,
    subjects,
  } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    if (action === "save_subjects") {
      const cid = cycle_id ?? (await ensureDraftCycle(user_id))
      if (!Array.isArray(subjects)) {
        return NextResponse.json({ error: "subjects obrigatório" }, { status: 400 })
      }
      await saveCycleSubjects(cid, subjects)
      return NextResponse.json({ ok: true, cycle_id: cid })
    }

    const cid = cycle_id ?? (await ensureDraftCycle(user_id))

    if (action === "create_block") {
      if (!subject_id) {
        return NextResponse.json({ error: "subject_id obrigatório" }, { status: 400 })
      }
      const block = await createContentBlock(
        cid,
        subject_id,
        name ?? "Novo bloco",
        sort_order ?? 0,
        estimated_minutes ?? 45
      )
      return NextResponse.json({ block, cycle_id: cid })
    }

    if (action === "add_topic" && block_id) {
      const topic = await addTopicToContentBlock(
        block_id,
        tec_subject,
        tec_topic ?? "",
        sort_order ?? 0
      )
      return NextResponse.json({ topic })
    }

    if (action === "add_topics" && block_id && Array.isArray(topics)) {
      const result = await addTopicsToContentBlock(
        block_id,
        topics as { tec_subject: string; tec_topic: string }[],
        sort_order ?? 0
      )
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { block_id, name, sort_order, estimated_minutes } = body

  if (!block_id) {
    return NextResponse.json({ error: "block_id obrigatório" }, { status: 400 })
  }

  try {
    await updateContentBlock(block_id, { name, sort_order, estimated_minutes })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const block_id = searchParams.get("block_id")
  const topic_id = searchParams.get("topic_id")

  try {
    if (topic_id) {
      await removeTopicFromContentBlock(topic_id)
      return NextResponse.json({ ok: true })
    }
    if (block_id) {
      await deleteContentBlock(block_id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "block_id ou topic_id obrigatório" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
