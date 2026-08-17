import { NextResponse } from "next/server"
import type { User } from "@supabase/supabase-js"
import { supabaseServer } from "@/lib/supabase-server"

/** Lista de e-mails (vírgula) com permissão para criar/editar/excluir tutoriais. */
export function getTutorialManagerEmails(): string[] {
  return (process.env.TUTORIALS_MANAGER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isTutorialManagerEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return getTutorialManagerEmails().includes(email.trim().toLowerCase())
}

export async function getAuthUserFromRequest(
  req: Request
): Promise<{ user: User | null; error: string | null }> {
  const header = req.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!token) return { user: null, error: "Não autenticado" }

  const { data, error } = await supabaseServer.auth.getUser(token)
  if (error || !data.user) return { user: null, error: "Não autenticado" }
  return { user: data.user, error: null }
}

export async function requireAuthUser(req: Request): Promise<
  | { user: User; response: null }
  | { user: null; response: NextResponse }
> {
  const { user, error } = await getAuthUserFromRequest(req)
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: error ?? "Não autenticado" }, { status: 401 }),
    }
  }
  return { user, response: null }
}

export async function requireTutorialManager(req: Request): Promise<
  | { user: User; response: null }
  | { user: null; response: NextResponse }
> {
  const auth = await requireAuthUser(req)
  if (!auth.user) return auth
  if (!isTutorialManagerEmail(auth.user.email)) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Sem permissão para gerenciar tutoriais" },
        { status: 403 }
      ),
    }
  }
  return auth
}
