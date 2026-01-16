import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "user_id e subject_id são obrigatórios" },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseServer
    .from("topics")
    .select("*")
    .eq("user_id", user_id)
    .eq("subject_id", subject_id)
    .order("created_at", { ascending: true })

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
  const { user_id, subject_id, name } = body

  if (!user_id || !subject_id || !name) {
    return NextResponse.json(
      { error: "user_id, subject_id e name são obrigatórios" },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from("topics")
    .insert([
      {
        user_id,
        subject_id,
        name
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
