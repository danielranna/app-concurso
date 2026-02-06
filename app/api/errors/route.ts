import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { unstable_cache } from "next/cache"

/* =========================
   GET /api/errors
========================= */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const user_id = searchParams.get("user_id")
  const topic_ids = searchParams.getAll("topic_id")
  const subject_id = searchParams.get("subject_id")
  const error_statuses = searchParams.getAll("error_status")
  const error_types = searchParams.getAll("error_type")

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id é obrigatório" },
      { status: 400 }
    )
  }

  // Cria uma chave única para o cache baseada nos parâmetros
  const cacheKey = `errors-${user_id}-${subject_id || 'all'}-${topic_ids.sort().join(',')}-${error_types.sort().join(',')}-${error_statuses.sort().join(',')}`

  // Cache por 1 minuto (dados mais dinâmicos)
  const getCachedErrors = unstable_cache(
    async (
      userId: string,
      topicIds: string[],
      subjectId: string | null,
      errorStatuses: string[],
      errorTypes: string[]
    ) => {
      let query = supabaseServer
        .from("errors")
        .select(
          `
          id,
          error_text,
          correction_text,
          description,
          reference_link,
          error_status,
          error_type,
          created_at,
          review_count,
          needs_intervention,
          topics!inner (
            id,
            name,
            subject_id,
            subjects (
              id,
              name
            )
          )
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (topicIds.length > 0) {
        query = query.in("topic_id", topicIds)
      }

      if (subjectId) {
        query = query.eq("topics.subject_id", subjectId)
      }

      if (errorStatuses.length > 0) {
        query = query.in("error_status", errorStatuses)
      }

      if (errorTypes.length > 0) {
        query = query.in("error_type", errorTypes)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(error.message)
      }

      return data ?? []
    },
    ["errors"],
    {
      revalidate: 60, // 1 minuto
      tags: [`errors-${user_id}`, subject_id ? `errors-subject-${subject_id}` : 'errors-all'],
    }
  )

  try {
    const data = await getCachedErrors(
      user_id,
      topic_ids,
      subject_id,
      error_statuses,
      error_types
    )
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

/* =========================
   POST /api/errors
========================= */
export async function POST(req: Request) {
  const { revalidateTag } = await import("next/cache")
  const body = await req.json()

  const {
    user_id,
    topic_id,
    error_text,
    correction_text,
    description,
    reference_link,
    error_type,
    error_status
  } = body

  if (!user_id || !topic_id || !error_text || !correction_text) {
    return NextResponse.json(
      { error: "Campos obrigatórios ausentes" },
      { status: 400 }
    )
  }

  // Busca o subject_id antes de inserir para revalidar o cache correto
  const { data: topic } = await supabaseServer
    .from("topics")
    .select("subject_id")
    .eq("id", topic_id)
    .single()

  const { error } = await supabaseServer
    .from("errors")
    .insert([
      {
        user_id,
        topic_id,
        error_text,
        correction_text,
        description: description || null,
        reference_link: reference_link || null,
        error_type,
        error_status: error_status || "normal"
      }
    ])

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  // Revalida o cache após inserção
  revalidateTag(`errors-${user_id}`, "max")
  if (topic?.subject_id) {
    revalidateTag(`errors-subject-${topic.subject_id}`, "max")
  }
  revalidateTag('errors-all', "max")
  // Também revalida o cache de análise pois novos erros afetam as estatísticas
  revalidateTag(`analysis-${user_id}`, "max")
  revalidateTag('analysis-all', "max")

  return NextResponse.json({ success: true })
}
