import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const user_id = searchParams.get("user_id")
  const topic_id = searchParams.get("topic_id")
  const error_status = searchParams.get("error_status")

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id é obrigatório" },
      { status: 400 }
    )
  }

  let query = supabaseServer
    .from("errors")
    .select(`
      id,
      error_text,
      correction_text,
      description,
      reference_link,
      error_status,
      created_at,
      topics (
        id,
        name,
        subjects (
          id,
          name
        )
      )
    `)
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })

  if (topic_id) {
    query = query.eq("topic_id", topic_id)
  }

  if (error_status) {
    query = query.eq("error_status", error_status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const body = await req.json()

  const {
    user_id,
    topic_id,
    error_text,
    correction_text,
    description,
    reference_link,
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
        description,
        reference_link,
        error_status
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
