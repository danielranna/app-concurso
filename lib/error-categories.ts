import { supabaseServer } from "./supabase-server"

export const CATEGORY_FCC = "FCC"
export const CATEGORY_SIMULADO_CESPE = "Simulado Cespe"

export type ErrorCategory = {
  id: string
  user_id: string
  name: string
  color?: string | null
  is_default_auto?: boolean
  created_at?: string
}

export async function ensureErrorCategory(
  userId: string,
  name: string,
  options?: { isDefaultAuto?: boolean; color?: string | null }
): Promise<ErrorCategory> {
  const { data: existing } = await supabaseServer
    .from("error_categories")
    .select("*")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle()

  if (existing) return existing as ErrorCategory

  const { data, error } = await supabaseServer
    .from("error_categories")
    .insert({
      user_id: userId,
      name,
      is_default_auto: options?.isDefaultAuto ?? false,
      color: options?.color ?? null,
    })
    .select("*")
    .single()

  if (error) {
    // race on unique
    const { data: raced } = await supabaseServer
      .from("error_categories")
      .select("*")
      .eq("user_id", userId)
      .eq("name", name)
      .maybeSingle()
    if (raced) return raced as ErrorCategory
    throw new Error(error.message)
  }

  return data as ErrorCategory
}

export async function ensureDefaultErrorCategories(userId: string) {
  const fcc = await ensureErrorCategory(userId, CATEGORY_FCC, {
    isDefaultAuto: false,
  })
  const cespe = await ensureErrorCategory(userId, CATEGORY_SIMULADO_CESPE, {
    isDefaultAuto: true,
  })
  return { fcc, cespe }
}

export async function getSimuladoCespeCategoryId(userId: string): Promise<string> {
  const { cespe } = await ensureDefaultErrorCategories(userId)
  return cespe.id
}

export async function getFccCategoryId(userId: string): Promise<string> {
  const { fcc } = await ensureDefaultErrorCategories(userId)
  return fcc.id
}
