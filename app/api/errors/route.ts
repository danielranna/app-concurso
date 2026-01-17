import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/* =========================
   GET /api/errors
========================= */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const user_id = searchParams.get("user_id")
  const topic_ids = searchParams.getAll("topic_id")
  const subject_id = searchParams.get("subject_id")
  const error_statuses = searchParams.getAll("error_status")
  const error_types = searchParams.getAll("error_type")

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id é obrigatório" },
      { status: 400 }
    )
  }

  let query = supabaseServer
    .from("errors")
    .select(
      `
      id,
      error_text,
      correction_text,
      description,
      reference_link,
      error_status,
      error_type,
      created_at,
      topics!inner (
        id,
        name,
        subject_id,
        subjects (
          id,
          name
        )
      )
    `
    )
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })

  if (topic_ids.length > 0) {
    query = query.in("topic_id", topic_ids)
  }

  if (subject_id) {
    query = query.eq("topics.subject_id", subject_id)
  }

  if (error_statuses.length > 0) {
    query = query.in("error_status", error_statuses)
  }

  if (error_types.length > 0) {
    query = query.in("error_type", error_types)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json(data ?? [])
}

/* =========================
   POST /api/errors
========================= */
export async function POST(req: Request) {
  const body = await req.json()

  const {
    user_id,
    topic_id,
    error_text,
    correction_text,
    description,
    reference_link,
    error_type,
    error_status
  } = body

  if (!user_id || !topic_id || !error_text || !correction_text) {
    return NextResponse.json(
      { error: "Campos obrigatórios ausentes" },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from("errors")
    .insert([
      {
        user_id,
        topic_id,
        error_text,
        correction_text,
        description: description || null,
        reference_link: reference_link || null,
        error_type,
        error_status: error_status || "normal"
      }
    ])

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
