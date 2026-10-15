import { NextResponse } from "next/server"
import { createEventKind, deleteEventKind, listEventKinds, updateEventKind } from "@/lib/agenda"
import type { AgendaFieldType } from "@/lib/agenda-types"

function parseFields(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw.map((field) => {
    const row = field as {
      id?: string | null
      label?: string
      field_type?: string
      color?: string | null
    }
    return {
      id: row.id ?? null,
      label: String(row.label ?? ""),
      field_type: String(row.field_type ?? "text") as AgendaFieldType,
      color: row.color ?? null,
    }
  })
}

export async function GET(req: Request) {
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }
  try {
    const kinds = await listEventKinds(user_id)
    return NextResponse.json({ kinds })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, name } = body
  if (!user_id || !name) {
    return NextResponse.json({ error: "user_id e name obrigatórios" }, { status: 400 })
  }
  try {
    const kind = await createEventKind({
      user_id,
      name,
      fields: parseFields(body.fields),
    })
    return NextResponse.json({ kind })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { user_id, id, name } = body
  if (!user_id || !id || !name) {
    return NextResponse.json({ error: "user_id, id e name obrigatórios" }, { status: 400 })
  }
  try {
    const kind = await updateEventKind({
      id,
      user_id,
      name,
      fields: parseFields(body.fields),
    })
    return NextResponse.json({ kind })
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
    await deleteEventKind(id, user_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
