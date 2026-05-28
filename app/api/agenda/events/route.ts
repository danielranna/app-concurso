import { NextResponse } from "next/server"
import { createEvent, deleteEvent, listEventsInRange } from "@/lib/agenda"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  if (!user_id || !from || !to) {
    return NextResponse.json(
      { error: "user_id, from e to obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const events = await listEventsInRange(user_id, from, to)
    return NextResponse.json({ events })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, title, event_date, end_date, notes, color } = body

  if (!user_id || !title || !event_date) {
    return NextResponse.json(
      { error: "user_id, title e event_date obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const event = await createEvent({
      user_id,
      title,
      event_date,
      end_date,
      notes,
      color,
    })
    return NextResponse.json({ event })
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
    await deleteEvent(id, user_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
