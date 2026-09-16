import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { name, color } = body

  if (!id) {
    return NextResponse.json({ error: "ID obrigatório" }, { status: 400 })
  }

  const { data: existing } = await supabaseServer
    .from("error_categories")
    .select("user_id")
    .eq("id", id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof name === "string" && name.trim()) patch.name = name.trim()
  if (color !== undefined) patch.color = color

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("error_categories")
    .update(patch)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { revalidateTag } = await import("next/cache")
  revalidateTag(`error-categories-${existing.user_id}`, "max")
  revalidateTag(`errors-${existing.user_id}`, "max")

  return NextResponse.json({ success: true, data })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: "ID obrigatório" }, { status: 400 })
  }

  const { data: existing } = await supabaseServer
    .from("error_categories")
    .select("user_id, name")
    .eq("id", id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 })
  }

  // Clear preference if this was active
  await supabaseServer
    .from("user_preferences")
    .update({ active_error_category_id: null })
    .eq("user_id", existing.user_id)
    .eq("active_error_category_id", id)

  const { error } = await supabaseServer.from("error_categories").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { revalidateTag } = await import("next/cache")
  revalidateTag(`error-categories-${existing.user_id}`, "max")
  revalidateTag(`errors-${existing.user_id}`, "max")

  return NextResponse.json({ success: true })
}
