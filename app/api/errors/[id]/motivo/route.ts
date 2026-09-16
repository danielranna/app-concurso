import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/** PATCH: atualiza apenas o motivo (informado pelo aluno). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const motivo =
    typeof body.motivo === "string" && body.motivo.trim()
      ? body.motivo.trim()
      : null

  const { data: errorData } = await supabaseServer
    .from("errors")
    .select("user_id, topics!inner(subject_id)")
    .eq("id", id)
    .single()

  if (!errorData) {
    return NextResponse.json({ error: "Erro não encontrado" }, { status: 404 })
  }

  const { error } = await supabaseServer
    .from("errors")
    .update({ motivo })
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { revalidateTag } = await import("next/cache")
  if (errorData.user_id) {
    revalidateTag(`errors-${errorData.user_id}`, "max")
    revalidateTag("errors-all", "max")
  }

  return NextResponse.json({ success: true, motivo })
}
