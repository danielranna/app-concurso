import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { listUnmappedPairs, suggestMapping } from "@/lib/tec-mapping"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  if (searchParams.get("unmapped") === "1") {
    const unmapped = await listUnmappedPairs(user_id)
    return NextResponse.json(unmapped)
  }

  const { data, error } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .select("*")
    .eq("user_id", user_id)
    .order("tec_subject")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, tec_subject, tec_topic, subject_id, topic_id } = body

  if (!user_id || !tec_subject || !subject_id) {
    return NextResponse.json(
      { error: "user_id, tec_subject e subject_id são obrigatórios" },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .upsert(
      {
        user_id,
        tec_subject,
        tec_topic: tec_topic ?? "",
        subject_id,
        topic_id: topic_id ?? null,
      },
      { onConflict: "user_id,tec_subject,tec_topic" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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
