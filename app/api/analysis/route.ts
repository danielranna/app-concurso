import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/* =========================
   GET /api/analysis
   Busca dados para análise de eficiência dos cards
========================= */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")
  const only_flagged = searchParams.get("only_flagged") === "true"

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id é obrigatório" },
      { status: 400 }
    )
  }

  try {
    // Busca todos os erros com review_count
    let query = supabaseServer
      .from("errors")
      .select(`
        id,
        error_text,
        correction_text,
        error_status,
        error_type,
        review_count,
        needs_intervention,
        intervention_flagged_at,
        intervention_resolved_at,
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
      `)
      .eq("user_id", user_id)
      .order("review_count", { ascending: false })

    if (subject_id) {
      query = query.eq("topics.subject_id", subject_id)
    }

    if (only_flagged) {
      query = query.eq("needs_intervention", true)
    }

    const { data: errors, error: errorsError } = await query

    if (errorsError) {
      throw new Error(errorsError.message)
    }

    // Busca as preferências do usuário para pegar os pesos
    const { data: preferences } = await supabaseServer
      .from("user_preferences")
      .select("analysis_config")
      .eq("user_id", user_id)
      .single()

    // Busca os status do usuário
    const { data: errorStatuses } = await supabaseServer
      .from("error_statuses")
      .select("id, name, color")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true })

    // Configuração padrão se não existir
    const defaultConfig: {
      status_config: { [key: string]: { weight: number; expected_reviews: number } }
      problem_threshold: number
      auto_flag_enabled: boolean
    } = {
      status_config: {},
      problem_threshold: 10,
      auto_flag_enabled: true
    }

    // Cria config padrão para cada status se não existir
    if (errorStatuses) {
      const total = errorStatuses.length
      errorStatuses.forEach((status, index) => {
        defaultConfig.status_config[status.name] = {
          // Peso invertido: primeiro status = peso alto, último = peso baixo
          weight: total - 1 - index,
          // Revisões esperadas padrão: 5
          expected_reviews: 5
        }
      })
    }

    const config = preferences?.analysis_config || defaultConfig

    // Mescla configs padrão com configs do usuário (para status novos)
    const statusConfig: { [key: string]: { weight: number; expected_reviews: number } } = { ...defaultConfig.status_config }
    if (config.status_config) {
      Object.keys(config.status_config).forEach(key => {
        statusConfig[key] = config.status_config[key]
      })
    }

    // Calcula índice de problema para cada card
    // NOVA LÓGICA: excesso = revisões - esperadas, índice = excesso × peso
    const analysisData = (errors ?? []).map(error => {
      const statusName = error.error_status || ""
      const statusCfg = statusConfig[statusName] || { weight: 1, expected_reviews: 5 }
      const reviewCount = error.review_count || 0
      
      // Calcula excesso de revisões
      const excessReviews = Math.max(0, reviewCount - statusCfg.expected_reviews)
      
      // Índice de Problema: excesso × peso (quanto MAIOR, pior)
      // Só conta o excesso, não o total de revisões
      const problemIndex = excessReviews * statusCfg.weight

      // Precisa de atenção se tem excesso (passou das revisões esperadas)
      const needsAttention = excessReviews > 0

      // Acessa topics (vem como array do Supabase)
      const topicsArray = error.topics as unknown as { id: string; name: string; subject_id: string; subjects: { id: string; name: string }[] }[] | null
      const topics = topicsArray?.[0]
      const subjectData = topics?.subjects?.[0]

      return {
        id: error.id,
        error_text: error.error_text,
        correction_text: error.correction_text,
        error_status: error.error_status,
        error_type: error.error_type,
        review_count: reviewCount,
        expected_reviews: statusCfg.expected_reviews,
        excess_reviews: excessReviews,
        status_weight: statusCfg.weight,
        problem_index: problemIndex,
        needs_attention: needsAttention,
        needs_intervention: error.needs_intervention || false,
        intervention_flagged_at: error.intervention_flagged_at,
        intervention_resolved_at: error.intervention_resolved_at,
        created_at: error.created_at,
        subject_id: subjectData?.id || null,
        subject_name: subjectData?.name || "Sem matéria",
        topic_id: topics?.id || null,
        topic_name: topics?.name || null
      }
    })

    // Estatísticas gerais
    const totalCards = analysisData.length
    const flaggedCards = analysisData.filter(c => c.needs_intervention).length
    const attentionCards = analysisData.filter(c => c.needs_attention).length
    
    // Matéria mais problemática
    const subjectProblems: { [key: string]: { name: string; count: number } } = {}
    analysisData.forEach(card => {
      if (card.needs_attention || card.needs_intervention) {
        const key = card.subject_id || "none"
        if (!subjectProblems[key]) {
          subjectProblems[key] = { name: card.subject_name, count: 0 }
        }
        subjectProblems[key].count++
      }
    })
    
    const mostProblematicSubject = Object.entries(subjectProblems)
      .sort((a, b) => b[1].count - a[1].count)[0]

    return NextResponse.json({
      cards: analysisData,
      stats: {
        total: totalCards,
        flagged: flaggedCards,
        attention: attentionCards,
        most_problematic_subject: mostProblematicSubject 
          ? { name: mostProblematicSubject[1].name, count: mostProblematicSubject[1].count }
          : null
      },
      config: {
        status_config: statusConfig,
        problem_threshold: config.problem_threshold ?? 10,
        auto_flag_enabled: config.auto_flag_enabled ?? true
      },
      statuses: errorStatuses || []
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

/* =========================
   PUT /api/analysis
   Atualiza flag de intervenção de um ou mais cards
========================= */
export async function PUT(req: Request) {
  const body = await req.json()
  const { user_id, card_ids, needs_intervention } = body

  if (!user_id || !card_ids || card_ids.length === 0) {
    return NextResponse.json(
      { error: "user_id e card_ids são obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const updateData: {
      needs_intervention: boolean
      intervention_flagged_at?: string | null
      intervention_resolved_at?: string | null
    } = {
      needs_intervention
    }

    if (needs_intervention) {
      updateData.intervention_flagged_at = new Date().toISOString()
      updateData.intervention_resolved_at = null
    } else {
      updateData.intervention_resolved_at = new Date().toISOString()
    }

    const { error } = await supabaseServer
      .from("errors")
      .update(updateData)
      .in("id", card_ids)
      .eq("user_id", user_id)

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ success: true, updated: card_ids.length })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
