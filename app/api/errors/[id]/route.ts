import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/* =========================
   DELETE /api/errors/:id
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: "ID do erro é obrigatório" },
      { status: 400 }
    )
  }

  // Busca user_id e subject_id antes de deletar para revalidar o cache
  const { data: errorData } = await supabaseServer
    .from("errors")
    .select("user_id, topics!inner(subject_id)")
    .eq("id", id)
    .single()

  const { error } = await supabaseServer
    .from("errors")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  // Revalida o cache após deleção
  if (errorData?.user_id) {
    const { revalidateTag } = await import("next/cache")
    revalidateTag(`errors-${errorData.user_id}`, "max")
    revalidateTag('errors-all', "max")
    if (errorData?.topics && Array.isArray(errorData.topics) && errorData.topics[0]?.subject_id) {
      revalidateTag(`errors-subject-${errorData.topics[0].subject_id}`, "max")
    }
    // Também revalida o cache de análise
    revalidateTag(`analysis-${errorData.user_id}`, "max")
    revalidateTag('analysis-all', "max")
  }

  return NextResponse.json({ success: true })
}

/* =========================
   PUT /api/errors/:id
========================= */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: "ID do erro é obrigatório" },
      { status: 400 }
    )
  }

  const body = await req.json()

  // Se for apenas para incrementar o review_count
  if (body.increment_review === true) {
    try {
      // Usa a função RPC para incrementar o review_count
      const { error: rpcError } = await supabaseServer.rpc("increment_review_count", { error_id: id })
      
      if (rpcError) {
        throw new Error(rpcError.message)
      }

      // Busca user_id para revalidar o cache
      const { data: errorData } = await supabaseServer
        .from("errors")
        .select("user_id")
        .eq("id", id)
        .single()

      if (errorData?.user_id) {
        const { revalidateTag } = await import("next/cache")
        revalidateTag(`errors-${errorData.user_id}`, "max")
        // Também revalida o cache de análise pois review_count afeta problem_index
        revalidateTag(`analysis-${errorData.user_id}`, "max")
        revalidateTag('analysis-all', "max")
      }

      return NextResponse.json({ success: true })
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
  }

  const {
    topic_id,
    error_text,
    correction_text,
    description,
    reference_link,
    error_type,
    error_status
  } = body

  if (!topic_id || !error_text || !correction_text) {
    return NextResponse.json(
      { error: "Campos obrigatórios ausentes" },
      { status: 400 }
    )
  }

  // Busca user_id e subject_id antes de atualizar para revalidar o cache
  const { data: oldError } = await supabaseServer
    .from("errors")
    .select("user_id, topics!inner(subject_id)")
    .eq("id", id)
    .single()

  // Busca o novo subject_id se o topic_id mudou
  const { data: newTopic } = await supabaseServer
    .from("topics")
    .select("subject_id")
    .eq("id", topic_id)
    .single()

  const { error } = await supabaseServer
    .from("errors")
    .update({
      topic_id,
      error_text,
      correction_text,
      description: description || null,
      reference_link: reference_link || null,
      error_type,
      error_status
    })
    .eq("id", id)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  // Revalida o cache após atualização
  if (oldError?.user_id) {
    const { revalidateTag } = await import("next/cache")
    revalidateTag(`errors-${oldError.user_id}`, "max")
    revalidateTag('errors-all', "max")
    if (oldError?.topics && Array.isArray(oldError.topics) && oldError.topics[0]?.subject_id) {
      revalidateTag(`errors-subject-${oldError.topics[0].subject_id}`, "max")
    }
    if (newTopic?.subject_id && newTopic.subject_id !== oldError?.topics?.[0]?.subject_id) {
      revalidateTag(`errors-subject-${newTopic.subject_id}`, "max")
    }
    // Também revalida o cache de análise
    revalidateTag(`analysis-${oldError.user_id}`, "max")
    revalidateTag('analysis-all', "max")
  }

  return NextResponse.json({ success: true })
}
