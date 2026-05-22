import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  parseBankFiltersFromSearchParams,
  applyMappingFilter,
} from "@/lib/question-bank"

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, name, subject_id, folder_id, filters: bodyFilters, limit = 200 } =
    body

  if (!user_id || !name || !subject_id) {
    return NextResponse.json(
      { error: "user_id, name e subject_id obrigatórios" },
      { status: 400 }
    )
  }

  let filters = bodyFilters ?? {}
  if (filters.subject_id || filters.topic_id) {
    filters = await applyMappingFilter(user_id, filters)
  }

  let query = supabaseServer.from("questions").select("id, tec_id")

  if (filters.banca?.length) query = query.in("banca", filters.banca)
  if (filters.orgao?.length) query = query.in("orgao", filters.orgao)
  if (filters.cargo?.length) query = query.in("cargo", filters.cargo)
  if (filters.ano?.length) query = query.in("ano", filters.ano)
  if (filters.tec_subject?.length) query = query.in("tec_subject", filters.tec_subject)
  if (filters.tec_topic?.length) query = query.in("tec_topic", filters.tec_topic)
  if (filters.type?.length) query = query.in("type", filters.type)

  query = query.limit(Math.min(limit, 500))

  const { data: questions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const seen = new Set<number>()
  const uniqueIds: string[] = []
  for (const q of questions ?? []) {
    if (seen.has(q.tec_id)) continue
    seen.add(q.tec_id)
    uniqueIds.push(q.id)
  }

  const { data: notebook, error: nbErr } = await supabaseServer
    .from("notebooks")
    .insert({
      user_id,
      name,
      subject_id,
      folder_id: folder_id ?? null,
      question_count: uniqueIds.length,
    })
    .select("id")
    .single()

  if (nbErr) return NextResponse.json({ error: nbErr.message }, { status: 500 })

  let skipped = 0
  for (let i = 0; i < uniqueIds.length; i++) {
    const { error: insErr } = await supabaseServer.from("notebook_questions").insert({
      notebook_id: notebook.id,
      question_id: uniqueIds[i],
      position: i,
    })
    if (insErr?.code === "23505") skipped++
  }

  return NextResponse.json({
    notebook_id: notebook.id,
    question_count: uniqueIds.length,
    skipped,
  })
}
