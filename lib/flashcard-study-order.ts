/** Cards adiados na sessão (ex. Again) vão para o fim, mantendo ordem relativa. */
export function applyDeferToQueue<T extends { card_id: string }>(
  rows: T[],
  deferCardIds: string[]
): T[] {
  if (!deferCardIds.length) return rows
  const deferSet = new Set(deferCardIds)
  const front: T[] = []
  const back: T[] = []
  for (const row of rows) {
    if (deferSet.has(row.card_id)) back.push(row)
    else front.push(row)
  }
  return [...front, ...back]
}
