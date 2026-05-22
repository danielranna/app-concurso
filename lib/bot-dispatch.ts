export function computeDispatchSchedule(
  cardCount: number,
  confirmedAt: Date,
  startHour: number,
  endHour: number
): { windowStart: Date; windowEnd: Date; times: Date[] } {
  const windowStart = new Date(confirmedAt)
  const dayStart = new Date(confirmedAt)
  dayStart.setHours(startHour, 0, 0, 0)
  if (windowStart < dayStart) {
    windowStart.setTime(dayStart.getTime())
  }

  const windowEnd = new Date(confirmedAt)
  windowEnd.setHours(endHour, 0, 0, 0)

  if (windowEnd <= windowStart || cardCount <= 0) {
    return { windowStart, windowEnd, times: [] }
  }

  const totalMs = windowEnd.getTime() - windowStart.getTime()
  const intervalMs = cardCount <= 1 ? 0 : totalMs / (cardCount - 1)

  const times: Date[] = []
  for (let i = 0; i < cardCount; i++) {
    times.push(new Date(windowStart.getTime() + i * intervalMs))
  }

  return { windowStart, windowEnd, times }
}
