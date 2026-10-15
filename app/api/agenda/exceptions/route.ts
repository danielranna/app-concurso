import { NextResponse } from "next/server"
import { deleteBlockException, upsertBlockException } from "@/lib/agenda"
import type { AgendaBlockExceptionAction } from "@/lib/agenda-types"

export async function PUT(req: Request) {
  const body = await req.json()
  const { user_id, weekly_block_id, agenda_date, action, start_time, end_time, title } = body

  if (!user_id || !weekly_block_id || !agenda_date || !action) {
    return NextResponse.json(
      { error: "user_id, weekly_block_id, agenda_date e action obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const exception = await upsertBlockException({
      user_id,
      weekly_block_id,
      agenda_date,
      action: action as AgendaBlockExceptionAction,
      start_time,
      end_time,
      title,
    })
    return NextResponse.json({ exception })
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
    await deleteBlockException(id, user_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
