import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { unstable_cache } from "next/cache"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "user_id e subject_id são obrigatórios" },
      { status: 400 }
    )
  }

  // Cache por 5 minutos
  const getCachedTopics = unstable_cache(
    async (userId: string, subjectId: string) => {
      const { data, error } = await supabaseServer
        .from("topics")
        .select("*")
        .eq("user_id", userId)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: true })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    ["topics"],
    {
      revalidate: 300, // 5 minutos
      tags: [`topics-${user_id}-${subject_id}`],
    }
  )

  try {
    const data = await getCachedTopics(user_id, subject_id)
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
  const { user_id, subject_id, name } = body

  if (!user_id || !subject_id || !name) {
    return NextResponse.json(
      { error: "user_id, subject_id e name são obrigatórios" },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from("topics")
    .insert([
      {
        user_id,
        subject_id,
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
  revalidateTag(`topics-${user_id}-${subject_id}`)

  return NextResponse.json({ success: true })
}
