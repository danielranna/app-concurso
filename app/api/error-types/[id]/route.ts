import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { revalidateTag } from "next/cache"

/* =========================
   DELETE /api/error-types/:id
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: "ID do tipo de erro é obrigatório" },
      { status: 400 }
    )
  }

  // Se o ID é gerado (começa com "type-"), não pode deletar
  if (id.startsWith("type-")) {
    return NextResponse.json(
      { error: "Não é possível deletar tipos gerados automaticamente" },
      { status: 400 }
    )
  }

  // Busca o user_id antes de deletar para revalidar o cache
  const { data: errorType } = await supabaseServer
    .from("error_types")
    .select("user_id")
    .eq("id", id)
    .single()

  const { error } = await supabaseServer
    .from("error_types")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Erro ao deletar tipo de erro:", error.message)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  // Revalida o cache após deleção
  if (errorType?.user_id) {
    revalidateTag(`error-types-${errorType.user_id}`)
  }

  return NextResponse.json({ success: true })
}
