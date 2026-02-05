import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/* =========================
   GET /api/user-preferences
   Busca preferências do usuário
========================= */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id é obrigatório" },
      { status: 400 }
    )
  }

  try {
    const { data, error } = await supabaseServer
      .from("user_preferences")
      .select("*")
      .eq("user_id", user_id)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned (não é erro real)
      throw new Error(error.message)
    }

    // Retorna preferências ou valores padrão
    return NextResponse.json(data || {
      user_id,
      history_chart_statuses: []
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

/* =========================
   PUT /api/user-preferences
   Atualiza ou cria preferências do usuário
========================= */
export async function PUT(req: Request) {
  const body = await req.json()

  const {
    user_id,
    history_chart_statuses,
    analysis_config
  } = body

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id é obrigatório" },
      { status: 400 }
    )
  }

  try {
    // Monta objeto de atualização apenas com campos enviados
    const updateData: {
      user_id: string
      history_chart_statuses?: string[]
      analysis_config?: {
        status_weights: { [key: string]: number }
        review_threshold: number
        efficiency_threshold: number
        auto_flag_enabled: boolean
      }
    } = { user_id }

    if (history_chart_statuses !== undefined) {
      updateData.history_chart_statuses = history_chart_statuses || []
    }

    if (analysis_config !== undefined) {
      updateData.analysis_config = analysis_config
    }

    // Upsert - insere ou atualiza se já existir
    const { data, error } = await supabaseServer
      .from("user_preferences")
      .upsert(updateData, { onConflict: "user_id" })
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
