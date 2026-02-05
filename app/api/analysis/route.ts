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

    // Configuração padrão se não existir
    const defaultConfig = {
      status_weights: {},
      review_threshold: 30,
      efficiency_threshold: 150,
      auto_flag_enabled: true
    }

    const config = preferences?.analysis_config || defaultConfig

    // Busca os status do usuário para criar pesos padrão
    const { data: errorStatuses } = await supabaseServer
      .from("error_statuses")
      .select("id, name, color")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true })

    // Se não há pesos configurados, cria pesos padrão baseado na ordem dos status
    // INVERTIDO: primeiro status (difícil) = peso maior, último (consolidado) = peso menor
    let statusWeights = config.status_weights || {}
    if (Object.keys(statusWeights).length === 0 && errorStatuses) {
      const total = errorStatuses.length
      errorStatuses.forEach((status, index) => {
        // Inverte: primeiro = peso alto, último = peso baixo
        statusWeights[status.name] = total - 1 - index
      })
    }

    // Calcula índice de problema para cada card
    const analysisData = (errors ?? []).map(error => {
      const statusName = error.error_status || ""
      const weight = statusWeights[statusName] ?? 0
      const reviewCount = error.review_count || 0
      
      // Índice de Problema: revisões × peso (quanto MAIOR, pior)
      // Cards com status de peso alto (difícil) e muitas revisões = problemático
      // Cards com status de peso baixo (consolidado) = índice baixo = ok
      const problemIndex = reviewCount * weight

      // Determina se precisa de atenção baseado nos thresholds
      // Card problemático: muitas revisões E índice acima do threshold
      const needsAttention = 
        reviewCount >= config.review_threshold && 
        problemIndex > config.efficiency_threshold

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
        status_weight: weight,
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
        ...config,
        status_weights: statusWeights
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
