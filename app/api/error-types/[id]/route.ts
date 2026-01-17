import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

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

  return NextResponse.json({ success: true })
}
