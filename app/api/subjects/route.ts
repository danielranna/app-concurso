import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { unstable_cache } from "next/cache"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id é obrigatório" },
      { status: 400 }
    )
  }

  // Cache por 5 minutos, revalidado quando necessário
  const getCachedSubjects = unstable_cache(
    async (userId: string) => {
      const { data, error } = await supabaseServer
        .from("subjects")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    ["subjects"],
    {
      revalidate: 300, // 5 minutos
      tags: [`subjects-${user_id}`],
    }
  )

  try {
    const data = await getCachedSubjects(user_id)
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const { revalidateTag } = await import("next/cache")
  const body = await req.json()
  const { user_id, name } = body

  if (!user_id || !name) {
    return NextResponse.json(
      { error: "user_id e name são obrigatórios" },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from("subjects")
    .insert([
      {
        user_id,
        name
      }
    ])

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  // Revalida o cache após inserção
  revalidateTag(`subjects-${user_id}`, "max")

  return NextResponse.json({ success: true })
}
