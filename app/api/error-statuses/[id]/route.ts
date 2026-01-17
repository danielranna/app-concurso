import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/* =========================
   PUT /api/error-statuses/:id
========================= */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { color } = body

  if (!id) {
    return NextResponse.json(
      { error: "ID do status é obrigatório" },
      { status: 400 }
    )
  }

  // Se o ID é gerado, não pode atualizar
  if (id.startsWith("status-")) {
    return NextResponse.json(
      { error: "Não é possível atualizar status gerados automaticamente" },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseServer
    .from("error_statuses")
    .update({ color: color || null })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Erro ao atualizar status:", error.message)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, data })
}

/* =========================
   DELETE /api/error-statuses/:id
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: "ID do status é obrigatório" },
      { status: 400 }
    )
  }

  // Se o ID é gerado ou é um status padrão, não pode deletar
  if (id.startsWith("status-") || ["normal", "critico", "reincidente", "aprendido"].includes(id)) {
    return NextResponse.json(
      { error: "Não é possível deletar status padrão ou gerados automaticamente" },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from("error_statuses")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Erro ao deletar status:", error.message)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
