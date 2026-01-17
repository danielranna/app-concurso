import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/* =========================
   GET /api/error-types
   Tenta buscar da tabela error_types, se não existir, busca da tabela errors
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

  // Tenta buscar da tabela error_types primeiro
  const { data: typesData, error: typesError } = await supabaseServer
    .from("error_types")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true })

  if (!typesError && typesData && typesData.length > 0) {
    return NextResponse.json(typesData)
  }

  // Se não tem tabela ou está vazia, busca valores únicos da tabela errors
  const { data: errorsData, error: errorsError } = await supabaseServer
    .from("errors")
    .select("error_type")
    .eq("user_id", user_id)

  if (errorsError) {
    console.error("Erro ao buscar tipos de erro:", errorsError.message)
    return NextResponse.json([])
  }

  // Extrai valores únicos de error_type
  const uniqueTypes = Array.from(
    new Set(errorsData?.map(item => item.error_type).filter(Boolean) || [])
  ).map((name, index) => ({
    id: `type-${index}`,
    name: name as string,
    user_id
  }))

  return NextResponse.json(uniqueTypes)
}

/* =========================
   POST /api/error-types
   Cria um novo tipo de erro na tabela error_types
========================= */
export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, name } = body

  if (!user_id || !name) {
    return NextResponse.json(
      { error: "user_id e name são obrigatórios" },
      { status: 400 }
    )
  }

  // Tenta inserir na tabela error_types
  const { data, error } = await supabaseServer
    .from("error_types")
    .insert([
      {
        user_id,
        name
      }
    ])
    .select()
    .single()

  if (error) {
    // Se a tabela não existe, retorna sucesso mesmo assim (funcionalidade degradada)
    console.error("Erro ao criar tipo de erro (tabela pode não existir):", error.message)
    return NextResponse.json({ 
      success: true, 
      message: "Tipo será criado automaticamente ao usar em um erro" 
    })
  }

  return NextResponse.json({ success: true, data })
}
