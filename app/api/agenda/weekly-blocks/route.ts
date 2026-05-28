import { NextResponse } from "next/server"
import {
  createWeeklyBlock,
  deleteWeeklyBlock,
  listWeeklyBlocks,
} from "@/lib/agenda"
import type { IsoWeekday } from "@/lib/agenda-types"

function parseWeekday(raw: string | null): IsoWeekday | null {
  const n = parseInt(raw ?? "", 10)
  if (n >= 1 && n <= 7) return n as IsoWeekday
  return null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  const weekday = parseWeekday(url.searchParams.get("weekday"))

  if (!user_id || weekday == null) {
    return NextResponse.json(
      { error: "user_id e weekday (1–7) obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const blocks = await listWeeklyBlocks(user_id, weekday)
    return NextResponse.json({ blocks, weekday })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, weekday: wd, start_time, end_time, title } = body
  const weekday = parseWeekday(String(wd ?? ""))

  if (!user_id || weekday == null || !start_time || !end_time || !title) {
    return NextResponse.json(
      { error: "user_id, weekday, start_time, end_time e title obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const block = await createWeeklyBlock({
      user_id,
      weekday,
      start_time,
      end_time,
      title,
    })
    return NextResponse.json({ block })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  const id = url.searchParams.get("id")

  if (!user_id || !id) {
    return NextResponse.json({ error: "user_id e id obrigatórios" }, { status: 400 })
  }

  try {
    await deleteWeeklyBlock(id, user_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
