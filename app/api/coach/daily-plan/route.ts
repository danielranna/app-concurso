import { NextResponse } from "next/server"
import { generateDailyStudyPlan } from "@/lib/ai/execution-plan"
import { planRowToDailyStudyPlan } from "@/lib/ai/execution-helpers"
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

  let completed_block_keys: string[] = []
  if (data.id) {
    const { data: completions } = await supabaseServer
      .from("plan_block_completions")
      .select("block_key")
      .eq("plan_id", data.id)
    completed_block_keys = (completions ?? []).map((c) => c.block_key)
  }

  const plan = planRowToDailyStudyPlan(data)
  const generation_meta =
    (data as { generation_meta?: unknown }).generation_meta ??
    plan.generation_meta
  return NextResponse.json({
    plan: {
      ...data,
      ...plan,
      plan_date: plan.date,
      completed_block_keys,
      generation_meta,
    },
  })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, force, pin, refresh_queue, stream } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  if (stream) {
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        const write = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
        }
        try {
          const plan = await generateDailyStudyPlan(user_id, Boolean(force), {
            pin: pin === true ? true : pin === false ? false : undefined,
            refreshQueue: Boolean(refresh_queue),
            onProgress: (step) => write({ type: "step", step }),
          })
          write({
            type: "done",
            plan: {
              ...plan,
              plan_date: plan.date,
              combined_notebook_id: plan.combined_notebook_id,
            },
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erro"
          write({ type: "error", error: msg })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    })
  }

  try {
    const plan = await generateDailyStudyPlan(user_id, Boolean(force), {
      pin: pin === true ? true : pin === false ? false : undefined,
      refreshQueue: Boolean(refresh_queue),
    })
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
