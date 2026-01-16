import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

/* =========================
   DELETE /api/errors/:id
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id

  if (!id) {
    return NextResponse.json(
      { error: "ID do erro é obrigatório" },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from("errors")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}

/* =========================
   PUT /api/errors/:id
========================= */
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id

  if (!id) {
    return NextResponse.json(
      { error: "ID do erro é obrigatório" },
      { status: 400 }
    )
  }

  const body = await req.json()

  const {
    topic_id,
    error_text,
    correction_text,
    description,
    reference_link,
    error_type,
    error_status
  } = body

  if (!topic_id || !error_text || !correction_text) {
    return NextResponse.json(
      { error: "Campos obrigatórios ausentes" },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from("errors")
    .update({
      topic_id,
      error_text,
      correction_text,
      description: description || null,
      reference_link: reference_link || null,
      error_type,
      error_status
    })
    .eq("id", id)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
