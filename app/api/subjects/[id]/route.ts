import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/* =========================
   DELETE /api/subjects/:id
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: "ID da matéria é obrigatório" },
      { status: 400 }
    )
  }

  // Busca o user_id antes de deletar para revalidar o cache
  const { data: subject } = await supabaseServer
    .from("subjects")
    .select("user_id")
    .eq("id", id)
    .single()

  const { error } = await supabaseServer
    .from("subjects")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  // Revalida o cache após deleção
  if (subject?.user_id) {
    const { revalidateTag } = await import("next/cache")
    revalidateTag(`subjects-${subject.user_id}`)
  }

  return NextResponse.json({ success: true })
}
