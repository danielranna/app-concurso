import { NextResponse } from "next/server"
import { isWidgetPeriod } from "@/lib/widget-types"
import { buildWidgetSummary } from "@/lib/widget-summary"

export const dynamic = "force-dynamic"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function clockFrom(hhmm: string): Date {
  const [hours, minutes] = hhmm.split(":").map((part) => Number(part))
  return new Date(2000, 0, 1, hours, minutes, 0, 0)
}

function serverTodayAndNow(): { today: string; now: string } {
  const current = new Date()
  const today = [
    current.getFullYear(),
    String(current.getMonth() + 1).padStart(2, "0"),
    String(current.getDate()).padStart(2, "0"),
  ].join("-")
  const now = `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`
  return { today, now }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userId = url.searchParams.get("user_id")?.trim() ?? ""
  if (!userId) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const periodParam = url.searchParams.get("period") ?? "7d"
  if (!isWidgetPeriod(periodParam)) {
    return NextResponse.json({ error: "period inválido" }, { status: 400 })
  }

  let since: string | null = null
  if (periodParam !== "all") {
    const sinceParam = url.searchParams.get("since")
    if (sinceParam) {
      const parsed = Date.parse(sinceParam)
      if (Number.isNaN(parsed)) {
        return NextResponse.json({ error: "since inválido" }, { status: 400 })
      }
      since = new Date(parsed).toISOString()
    } else if (periodParam === "hoje") {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      since = start.toISOString()
    } else {
      const days = periodParam === "7d" ? 7 : periodParam === "30d" ? 30 : 90
      const start = new Date()
      start.setDate(start.getDate() - days)
      since = start.toISOString()
    }
  }

  const todayParam = url.searchParams.get("today")
  const nowParam = url.searchParams.get("now")
  if (Boolean(todayParam) !== Boolean(nowParam)) {
    return NextResponse.json({ error: "today e now devem vir juntos" }, { status: 400 })
  }

  let today: string
  let now: string
  if (todayParam && nowParam) {
    if (!ISO_DATE.test(todayParam) || Number.isNaN(Date.parse(`${todayParam}T00:00:00`))) {
      return NextResponse.json({ error: "today inválido" }, { status: 400 })
    }
    if (!HHMM.test(nowParam)) {
      return NextResponse.json({ error: "now inválido" }, { status: 400 })
    }
    today = todayParam
    now = nowParam
  } else {
    const server = serverTodayAndNow()
    today = server.today
    now = server.now
  }

  try {
    const summary = await buildWidgetSummary({
      userId,
      period: periodParam,
      since,
      today,
      clock: clockFrom(now),
      appOrigin: url.origin,
    })
    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
