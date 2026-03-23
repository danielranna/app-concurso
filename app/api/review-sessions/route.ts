import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/* =========================
   GET /api/review-sessions
   Busca sessão de revisão ativa do usuário
========================= */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const id = searchParams.get("id")

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id é obrigatório" },
      { status: 400 }
    )
  }

  try {
    let query = supabaseServer
      .from("review_sessions")
      .select("*")
      .eq("user_id", user_id)
      .eq("status", "in_progress")
      .order("last_accessed_at", { ascending: false })
      .order("updated_at", { ascending: false })

    if (id) {
      query = query.eq("id", id).limit(1)
    }

    const { data, error } = await query

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned (não é erro real)
      throw new Error(error.message)
    }

    if (id) {
      return NextResponse.json((data && data[0]) || null)
    }

    return NextResponse.json(data || [])
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

/* =========================
   POST /api/review-sessions
   Cria nova sessão de revisão
========================= */
export async function POST(req: Request) {
  const body = await req.json()

  const {
    user_id,
    filters,
    card_ids
  } = body

  if (!user_id || !card_ids || card_ids.length === 0) {
    return NextResponse.json(
      { error: "user_id e card_ids são obrigatórios" },
      { status: 400 }
    )
  }

  try {
    // Cria nova sessão
    const { data, error } = await supabaseServer
      .from("review_sessions")
      .insert([
        {
          user_id,
          filters: filters || {},
          card_ids,
          reviewed_card_ids: [],
          status: "in_progress",
          last_accessed_at: new Date().toISOString()
        }
      ])
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
