import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const serverAuth = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const

export const supabaseServer = createClient(supabaseUrl, serviceRoleKey, {
  auth: serverAuth,
})

/** Cliente só para validar JWT do usuário (sem persistir sessão no serverless). */
export function createAuthClient() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(supabaseUrl, anonKey, { auth: serverAuth })
}
