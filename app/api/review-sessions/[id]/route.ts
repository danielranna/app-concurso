import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/* =========================
   PUT /api/review-sessions/:id
   Atualiza sessão (marcar card revisado, pausar, concluir)
========================= */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: "ID da sessão é obrigatório" },
      { status: 400 }
    )
  }

  const body = await req.json()
  const { action, card_id } = body

  try {
    // Busca sessão atual
    const { data: session, error: fetchError } = await supabaseServer
      .from("review_sessions")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !session) {
      return NextResponse.json(
        { error: "Sessão não encontrada" },
        { status: 404 }
      )
    }

    // Ações possíveis
    if (action === "mark_reviewed" && card_id) {
      // Marca card como revisado
      const reviewedCardIds = session.reviewed_card_ids || []
      
      if (!reviewedCardIds.includes(card_id)) {
        reviewedCardIds.push(card_id)

        // Incrementa review_count do card usando RPC
        await supabaseServer.rpc("increment_review_count", { error_id: card_id })

        // Atualiza sessão
        const { error: updateError } = await supabaseServer
          .from("review_sessions")
          .update({ reviewed_card_ids: reviewedCardIds })
          .eq("id", id)

        if (updateError) {
          throw new Error(updateError.message)
        }

        // Verifica se todos foram revisados
        if (reviewedCardIds.length >= session.card_ids.length) {
          await supabaseServer
            .from("review_sessions")
            .update({ status: "completed" })
            .eq("id", id)
        }
      }

      // Revalida cache de errors
      if (session.user_id) {
        const { revalidateTag } = await import("next/cache")
        revalidateTag(`errors-${session.user_id}`, "max")
      }

      return NextResponse.json({ success: true })
    }

    if (action === "complete") {
      // Marca sessão como concluída
      const { error: updateError } = await supabaseServer
        .from("review_sessions")
        .update({ status: "completed" })
        .eq("id", id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      return NextResponse.json({ success: true })
    }

    if (action === "cancel") {
      // Cancela sessão
      const { error: updateError } = await supabaseServer
        .from("review_sessions")
        .update({ status: "cancelled" })
        .eq("id", id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: "Ação inválida" },
      { status: 400 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

/* =========================
   DELETE /api/review-sessions/:id
   Cancela/deleta sessão
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: "ID da sessão é obrigatório" },
      { status: 400 }
    )
  }

  try {
    const { error } = await supabaseServer
      .from("review_sessions")
      .update({ status: "cancelled" })
      .eq("id", id)

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
