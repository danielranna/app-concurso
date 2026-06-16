export async function downloadCyclePdf(
  userId: string,
  options?: { targetWeeks?: number; defaultBlockMinutes?: number }
): Promise<void> {
  const params = new URLSearchParams({ user_id: userId })
  if (options?.targetWeeks != null) {
    params.set("target_weeks", String(options.targetWeeks))
  }
  if (options?.defaultBlockMinutes != null) {
    params.set("default_block_minutes", String(options.defaultBlockMinutes))
  }

  const res = await fetch(`/api/ciclo/pdf?${params}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error ?? "Falha ao baixar PDF"
    )
  }

  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match?.[1] ?? "plano-ciclo.pdf"

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
