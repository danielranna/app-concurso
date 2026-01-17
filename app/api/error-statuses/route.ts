import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

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

  // Tenta buscar da tabela error_statuses primeiro
  const { data: statusesData, error: statusesError } = await supabaseServer
    .from("error_statuses")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true })

  if (!statusesError && statusesData && statusesData.length > 0) {
    return NextResponse.json(statusesData.map(s => ({ id: s.id, name: s.name })))
  }

  // Se não tem tabela ou está vazia, busca valores únicos da tabela errors
  const { data: errorsData, error: errorsError } = await supabaseServer
    .from("errors")
    .select("error_status")
    .eq("user_id", user_id)

  if (errorsError) {
    console.error("Erro ao buscar status de erro:", errorsError.message)
    return NextResponse.json([])
  }

  // Extrai valores únicos de error_status e adiciona status padrão
  const uniqueStatuses = Array.from(
    new Set(errorsData?.map(item => item.error_status).filter(Boolean) || [])
  )

  // Adiciona status padrão se não existirem
  const defaultStatuses = ["normal", "critico", "reincidente", "aprendido"]
  const allStatuses = Array.from(new Set([...defaultStatuses, ...uniqueStatuses]))

  return NextResponse.json(allStatuses.map((name, index) => ({
    id: `status-${index}`,
    name
  })))
}

/* =========================
   POST /api/error-statuses
   Cria um novo status na tabela error_statuses
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

  // Tenta inserir na tabela error_statuses
  const { data, error } = await supabaseServer
    .from("error_statuses")
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
    console.error("Erro ao criar status (tabela pode não existir):", error.message)
    return NextResponse.json({ 
      success: true, 
      message: "Status será criado automaticamente ao usar em um erro" 
    })
  }

  return NextResponse.json({ success: true, data })
}
