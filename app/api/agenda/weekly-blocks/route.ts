import { NextResponse } from "next/server"
import {
  createWeeklyBlock,
  deleteWeeklyBlock,
  listAllWeeklyBlocks,
  listWeeklyBlocks,
  parseWeekdays,
} from "@/lib/agenda"
import type { IsoWeekday } from "@/lib/agenda-types"

function parseWeekdayParam(raw: string | null): IsoWeekday | null {
  const n = parseInt(raw ?? "", 10)
  if (n >= 1 && n <= 7) return n as IsoWeekday
  return null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  const weekday = parseWeekdayParam(url.searchParams.get("weekday"))

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const blocks =
      weekday != null
        ? await listWeeklyBlocks(user_id, weekday)
        : await listAllWeeklyBlocks(user_id)
    return NextResponse.json({ blocks, weekday })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, start_time, end_time, title, weekdays: wd } = body
  const weekdays = parseWeekdays(wd)

  if (!user_id || !start_time || !end_time || !title || !weekdays.length) {
    return NextResponse.json(
      {
        error:
          "user_id, start_time, end_time, title e weekdays (array 1–7) obrigatórios",
      },
      { status: 400 }
    )
  }

  try {
    const block = await createWeeklyBlock({
      user_id,
      weekdays,
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
