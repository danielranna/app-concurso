function todayLocal(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

async function download(path: string): Promise<void> {
  const res = await fetch(path)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? "Falha ao baixar PDF")
  }
  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match?.[1] ?? "evento.pdf"
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadAgendaEventPdf(userId: string, eventId: string): Promise<void> {
  const params = new URLSearchParams({
    user_id: userId,
    event_id: eventId,
    today: todayLocal(),
  })
  return download(`/api/agenda/pdf?${params}`)
}

export function downloadAgendaKindPdf(userId: string, kindId: string, includePast: boolean): Promise<void> {
  const params = new URLSearchParams({
    user_id: userId,
    kind_id: kindId,
    include_past: includePast ? "1" : "0",
    today: todayLocal(),
  })
  return download(`/api/agenda/pdf?${params}`)
}
