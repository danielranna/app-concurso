import { NextResponse } from "next/server"
import { isTutorialManagerEmail, requireAuthUser } from "@/lib/tutorial-permissions"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const auth = await requireAuthUser(req)
  if (!auth.user) return auth.response

  return NextResponse.json({
    canManage: isTutorialManagerEmail(auth.user.email),
  })
}
