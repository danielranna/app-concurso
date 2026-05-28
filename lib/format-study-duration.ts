/** Formata duração em ms — sem dependências de servidor (safe para client). */
export function formatStudyDuration(ms: number): string {
  if (ms <= 0) return "0 min"
  const totalMin = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hours === 0) return `${mins} min`
  if (mins === 0) return `${hours} h`
  return `${hours} h ${mins} min`
}
