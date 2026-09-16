import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { unstable_cache } from "next/cache"
import { ensureDefaultErrorCategories } from "@/lib/error-categories"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const ensure = searchParams.get("ensure") === "1"

  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  if (ensure) {
    await ensureDefaultErrorCategories(user_id)
  }

  const getCached = unstable_cache(
    async (userId: string) => {
      const { data, error } = await supabaseServer
        .from("error_categories")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })

      if (error) throw new Error(error.message)
      return data ?? []
    },
    ["error-categories"],
    { revalidate: 60, tags: [`error-categories-${user_id}`] }
  )

  try {
    const data = await getCached(user_id)
    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { revalidateTag } = await import("next/cache")
  const body = await req.json()
  const { user_id, name, color } = body

  if (!user_id || !name?.trim()) {
    return NextResponse.json(
      { error: "user_id e name são obrigatórios" },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseServer
    .from("error_categories")
    .insert({
      user_id,
      name: String(name).trim(),
      color: color ?? null,
      is_default_auto: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidateTag(`error-categories-${user_id}`, "max")
  return NextResponse.json({ success: true, data })
}
