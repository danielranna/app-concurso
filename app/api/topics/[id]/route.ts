import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { revalidateTag } from "next/cache"

/* =========================
   DELETE /api/topics/:id
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: "ID do tema é obrigatório" },
      { status: 400 }
    )
  }

  // Busca user_id e subject_id antes de deletar para revalidar o cache
  const { data: topic } = await supabaseServer
    .from("topics")
    .select("user_id, subject_id")
    .eq("id", id)
    .single()

  const { error } = await supabaseServer
    .from("topics")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  // Revalida o cache após deleção
  if (topic?.user_id && topic?.subject_id) {
    revalidateTag(`topics-${topic.user_id}-${topic.subject_id}`)
  }

  return NextResponse.json({ success: true })
}
