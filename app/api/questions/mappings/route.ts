import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  listUnmappedTecSubjects,
  listUnmappedTecTopics,
  listUnmappedTecTopicsGrouped,
  listMappedTopics,
  getMappingProgress,
  bulkMapTopicsByName,
  saveSubjectMapping,
  saveTopicMapping,
  createTopicAndMapping,
  loadMappings,
  resolveQuestionMapping,
} from "@/lib/tec-mapping"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const mode = searchParams.get("unmapped")

  if (mode === "subjects") {
    const items = await listUnmappedTecSubjects(user_id)
    return NextResponse.json(items)
  }

  if (mode === "topics") {
    const items = await listUnmappedTecTopics(user_id)
    return NextResponse.json(items)
  }

  if (mode === "topics_grouped") {
    const items = await listUnmappedTecTopicsGrouped(user_id)
    return NextResponse.json(items)
  }

  if (mode === "mapped") {
    const items = await listMappedTopics(user_id)
    return NextResponse.json(items)
  }

  if (mode === "progress") {
    const items = await getMappingProgress(user_id)
    return NextResponse.json(items)
  }

  if (mode === "1") {
    const items = await listUnmappedTecSubjects(user_id)
    return NextResponse.json(items)
  }

  const tec_subject = searchParams.get("tec_subject")
  if (searchParams.get("resolve") === "1" && tec_subject) {
    const resolved = await resolveQuestionMapping(
      user_id,
      tec_subject,
      searchParams.get("tec_topic")
    )
    return NextResponse.json(resolved)
  }

  const mappings = await loadMappings(user_id)
  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", user_id)

  return NextResponse.json({
    mappings,
    subjects: subjects ?? [],
  })
}

export async function POST(req: Request) {
  const body = await req.json()
  const {
    user_id,
    type = "subject",
    tec_subject,
    tec_topic,
    subject_id,
    topic_id,
  } = body

  if (!user_id || !tec_subject) {
    return NextResponse.json(
      { error: "user_id e tec_subject são obrigatórios" },
      { status: 400 }
    )
  }

  try {
    if (type === "subject") {
      if (!subject_id) {
        return NextResponse.json({ error: "subject_id obrigatório" }, { status: 400 })
      }
      const data = await saveSubjectMapping(user_id, tec_subject, subject_id)
      return NextResponse.json(data)
    }

    if (type === "topic") {
      if (!tec_topic || !topic_id) {
        return NextResponse.json(
          { error: "tec_topic e topic_id são obrigatórios" },
          { status: 400 }
        )
      }
      const data = await saveTopicMapping(user_id, tec_subject, tec_topic, topic_id)
      return NextResponse.json(data)
    }

    if (type === "topic_create") {
      if (!tec_topic) {
        return NextResponse.json({ error: "tec_topic obrigatório" }, { status: 400 })
      }
      const data = await createTopicAndMapping(user_id, tec_subject, tec_topic)
      return NextResponse.json(data)
    }

    if (type === "bulk_by_name") {
      const result = await bulkMapTopicsByName(user_id, tec_subject)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: "type inválido" }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao salvar" },
      { status: 400 }
    )
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  }
  const { error } = await supabaseServer.from("tec_taxonomy_mappings").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
