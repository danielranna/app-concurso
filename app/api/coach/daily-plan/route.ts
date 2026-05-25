import { NextResponse } from "next/server"
import { generateDailyStudyPlan } from "@/lib/ai/execution-plan"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabaseServer
    .from("daily_study_plans")
    .select("*")
    .eq("user_id", user_id)
    .eq("plan_date", today)
    .maybeSingle()

  if (!data) return NextResponse.json({ plan: null })

  const limits = (data.limits ?? {}) as Record<string, unknown>
  return NextResponse.json({
    plan: {
      ...data,
      combined_notebook_id:
        (limits.combined_notebook_id as string) ??
        (data.blocks as { params?: { notebook_id?: string } }[])?.find(
          (b) => b.params?.notebook_id
        )?.params?.notebook_id ??
        null,
    },
  })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, force } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const plan = await generateDailyStudyPlan(user_id, Boolean(force))
    return NextResponse.json({
      plan: {
        ...plan,
        plan_date: plan.date,
        combined_notebook_id: plan.combined_notebook_id,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
