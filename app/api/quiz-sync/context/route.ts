import { NextResponse } from "next/server"
import { getQuizBotSecret } from "@/lib/quiz-bot-url"
import { addWhatsappStudyNote, getWhatsappStudyContext } from "@/lib/quiz-sync"

export const maxDuration = 120

function authOk(req: Request) {
  const secret = getQuizBotSecret()
  const auth = req.headers.get("authorization")
  return Boolean(secret && auth === `Bearer ${secret}`)
}

function idsFrom(source: { tecId?: unknown; shortId?: unknown; cadernoId?: unknown; userJid?: unknown }) {
  const tecId = source.tecId != null ? Number(source.tecId) : null
  const cadernoId =
    source.cadernoId != null && Number.isFinite(Number(source.cadernoId))
      ? Number(source.cadernoId)
      : null
  return {
    userJid: String(source.userJid || "").trim(),
    tecId: Number.isFinite(tecId) && tecId! > 0 ? tecId : null,
    shortId: source.shortId ? String(source.shortId) : null,
    cadernoId,
  }
}

export async function GET(req: Request) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const url = new URL(req.url)
  const input = idsFrom({
    userJid: url.searchParams.get("userJid"),
    tecId: url.searchParams.get("tecId"),
    shortId: url.searchParams.get("shortId"),
    cadernoId: url.searchParams.get("cadernoId"),
  })
  if (!input.userJid || (!input.shortId && !input.tecId)) {
    return NextResponse.json({ error: "userJid e shortId/tecId obrigatórios" }, { status: 400 })
  }
  const data = await getWhatsappStudyContext(input)
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const input = idsFrom(body)
  const noteBody = String(body.body || body.note || "").trim()
  if (!input.userJid || (!input.shortId && !input.tecId) || !noteBody) {
    return NextResponse.json({ error: "userJid, shortId/tecId e body obrigatórios" }, { status: 400 })
  }
  const result = await addWhatsappStudyNote({ ...input, body: noteBody })
  return NextResponse.json(result)
}
