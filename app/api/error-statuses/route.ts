import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { unstable_cache } from "next/cache"

/* =========================
   GET /api/error-statuses
   Tenta buscar da tabela error_statuses, se não existir, busca da tabela errors
========================= */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id é obrigatório" },
      { status: 400 }
    )
  }

  // Cache por 5 minutos
  const getCachedErrorStatuses = unstable_cache(
    async (userId: string) => {
      // Tenta buscar da tabela error_statuses primeiro
      const { data: statusesData, error: statusesError } = await supabaseServer
        .from("error_statuses")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })

      if (!statusesError && statusesData && statusesData.length > 0) {
        return statusesData.map(s => ({ 
          id: s.id, 
          name: s.name,
          color: s.color || null
        }))
      }

      // Se não tem tabela ou está vazia, busca valores únicos da tabela errors
      const { data: errorsData, error: errorsError } = await supabaseServer
        .from("errors")
        .select("error_status")
        .eq("user_id", userId)

      if (errorsError) {
        console.error("Erro ao buscar status de erro:", errorsError.message)
        return []
      }

      // Extrai valores únicos de error_status (sem adicionar status padrão)
      const uniqueStatuses = Array.from(
        new Set(errorsData?.map(item => item.error_status).filter(Boolean) || [])
      )

      // Retorna apenas os status que realmente existem (sem adicionar padrão)
      return uniqueStatuses.map((name, index) => ({
        id: `status-${index}`,
        name
      }))
    },
    ["error-statuses"],
    {
      revalidate: 300, // 5 minutos
      tags: [`error-statuses-${user_id}`],
    }
  )

  try {
    const data = await getCachedErrorStatuses(user_id)
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

/* =========================
   POST /api/error-statuses
   Cria um novo status na tabela error_statuses
========================= */
export async function POST(req: Request) {
  const { revalidateTag } = await import("next/cache")
  const body = await req.json()
  const { user_id, name, color } = body

  if (!user_id || !name) {
    return NextResponse.json(
      { error: "user_id e name são obrigatórios" },
      { status: 400 }
    )
  }

  // Tenta inserir na tabela error_statuses
  const { data, error } = await supabaseServer
    .from("error_statuses")
    .insert([
      {
        user_id,
        name,
        color: color || null
      }
    ])
    .select()
    .single()

  if (error) {
    // Se a tabela não existe, retorna sucesso mesmo assim (funcionalidade degradada)
    console.error("Erro ao criar status (tabela pode não existir):", error.message)
    return NextResponse.json({ 
      success: true, 
      message: "Status será criado automaticamente ao usar em um erro" 
    })
  }

  // Revalida o cache após inserção
  revalidateTag(`error-statuses-${user_id}`)

  return NextResponse.json({ success: true, data })
}
