import { NextResponse } from "next/server"
import type { User } from "@supabase/supabase-js"
import { createAuthClient } from "@/lib/supabase-server"

const AUTH_TIMEOUT_MS = 8000

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

export async function getAuthUserFromRequest(
  req: Request
): Promise<{ user: User | null; error: string | null }> {
  const header = req.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!token) return { user: null, error: "Não autenticado" }

  try {
    const { data, error } = await withTimeout(
      createAuthClient().auth.getUser(token),
      AUTH_TIMEOUT_MS
    )
    if (error || !data.user) return { user: null, error: "Não autenticado" }
    return { user: data.user, error: null }
  } catch {
    return { user: null, error: "Não autenticado" }
  }
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
