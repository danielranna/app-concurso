import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ""

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
  ].filter(Boolean)

  throw new Error(
    `Supabase não configurado (faltam: ${missing.join(", ")}). ` +
      "No Vercel: Settings → Environment Variables → adicione essas variáveis em Production e faça redeploy."
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)