import { NextResponse } from "next/server"
import {
  createDailyBlock,
  deleteDailyBlock,
  listDailyBlocks,
} from "@/lib/agenda"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  const agenda_date = url.searchParams.get("date")

  if (!user_id || !agenda_date) {
    return NextResponse.json(
      { error: "user_id e date obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const blocks = await listDailyBlocks(user_id, agenda_date)
    return NextResponse.json({ blocks })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, agenda_date, start_time, end_time, title, notes } = body

  if (!user_id || !agenda_date || !start_time || !end_time || !title) {
    return NextResponse.json(
      { error: "user_id, agenda_date, start_time, end_time e title obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const block = await createDailyBlock({
      user_id,
      agenda_date,
      start_time,
      end_time,
      title,
      notes,
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
    await deleteDailyBlock(id, user_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
