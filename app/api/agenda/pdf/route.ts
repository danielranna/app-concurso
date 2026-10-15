import { NextResponse } from "next/server"
import { getOwnedEvent, listEventKinds, listEventsOfKind } from "@/lib/agenda"
import { agendaPdfFilename, renderAgendaPdfBuffer, type AgendaPdfField, type AgendaPdfSheet } from "@/lib/agenda-pdf-report"
import { sheetIsPast, sheetsForKindReport } from "@/lib/agenda-project"
import type { AgendaEvent, AgendaEventKind, AgendaEventKindField } from "@/lib/agenda-types"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function formatIso(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-")
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

function formatClock(value: string | null): string | null {
  if (!value) return null
  return value.slice(0, 5)
}

function fieldValue(field: AgendaEventKindField, raw: string | null): string {
  const text = raw?.trim() ?? ""
  if (!text) return "—"
  if (field.field_type === "date") {
    const iso = text.slice(0, 10)
    return ISO_DATE.test(iso) ? formatIso(iso) : text
  }
  if (field.field_type === "money") return text.startsWith("R$") ? text : `R$ ${text}`
  return text
}

function kindSheet(event: AgendaEvent, kind: AgendaEventKind, today: string): AgendaPdfSheet {
  const byField = new Map(event.values.map((value) => [value.field_id, value.value_text]))
  const fields: AgendaPdfField[] = kind.fields.map((field) => ({
    label: field.label,
    value: fieldValue(field, byField.get(field.id) ?? null),
  }))
  return {
    title: event.title,
    past: sheetIsPast(event.values, kind.fields, today),
    fields,
    notes: event.notes,
  }
}

function punctualSheet(event: AgendaEvent): AgendaPdfSheet {
  const fields: AgendaPdfField[] = [{ label: "Data", value: event.event_date ? formatIso(event.event_date) : "—" }]
  if (event.end_date) fields.push({ label: "Até", value: formatIso(event.end_date) })
  const start = formatClock(event.start_time)
  const end = formatClock(event.end_time)
  if (start) fields.push({ label: "Início", value: start })
  if (end) fields.push({ label: "Fim", value: end })
  return { title: event.title, past: false, fields, notes: event.notes }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userId = url.searchParams.get("user_id")
  const eventId = url.searchParams.get("event_id")
  const kindId = url.searchParams.get("kind_id")
  const today = url.searchParams.get("today") ?? new Date().toISOString().slice(0, 10)
  const includePast = url.searchParams.get("include_past") === "1"

  if (!userId || (!eventId && !kindId)) {
    return NextResponse.json({ error: "user_id e event_id ou kind_id obrigatórios" }, { status: 400 })
  }
  if (!ISO_DATE.test(today)) {
    return NextResponse.json({ error: "Data de hoje inválida" }, { status: 400 })
  }

  try {
    const generatedAt = new Date()
    if (eventId) {
      const event = await getOwnedEvent(userId, eventId)
      if (!event) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
      const kinds = event.kind_id ? await listEventKinds(userId) : []
      const kind = kinds.find((item) => item.id === event.kind_id) ?? null
      const pdf = await renderAgendaPdfBuffer({
        mode: "single",
        kindName: kind?.name ?? null,
        sheet: kind ? kindSheet(event, kind, today) : punctualSheet(event),
        generatedAt,
      })
      return pdfResponse(pdf, agendaPdfFilename(event.title, generatedAt))
    }

    const kinds = await listEventKinds(userId)
    const kind = kinds.find((item) => item.id === kindId)
    if (!kind) return NextResponse.json({ error: "Tipo de evento não encontrado" }, { status: 404 })
    const events = await listEventsOfKind(userId, kind.id)
    const selected = sheetsForKindReport(events, kind.fields, today, includePast)
    if (!selected.length) {
      const message = includePast
        ? "Nenhum evento deste tipo."
        : "Nenhum evento em aberto. Marque incluir passados para ver os que já encerraram."
      return NextResponse.json({ error: message }, { status: 400 })
    }
    const pdf = await renderAgendaPdfBuffer({
      mode: "compiled",
      kindName: kind.name,
      includePast,
      sheets: selected.map((event) => kindSheet(event, kind, today)),
      generatedAt,
    })
    return pdfResponse(pdf, agendaPdfFilename(kind.name, generatedAt))
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gerar PDF"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function pdfResponse(pdf: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
