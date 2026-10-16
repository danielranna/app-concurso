import type { ImportQuestionInput, QuestionType } from "./question-types"

const TEC_ORIGIN = "https://www.tecconcursos.com.br"
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string) {
  return UUID_RE.test(value)
}

export const extensionCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
}

export function sanitizeTecHtml(html: string): string {
  let out = String(html || "")
  out = out.replace(/<\s*(script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
  out = out.replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|form|svg|math|input|button)\b[^>]*>/gi, "")
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  out = out.replace(/\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  out = out.replace(/\s+srcset\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  out = out.replace(
    /\s+(href|src)\s*=\s*(["'])\s*(?:javascript:|data:)[^"']*\2/gi,
    ""
  )
  out = out.replace(
    /\s+(href|src)\s*=\s*(["'])(\/\/[^"']+)\2/gi,
    (_all, attr: string, quote: string, url: string) => ` ${attr}=${quote}https:${url}${quote}`
  )
  out = out.replace(
    /\s+(href|src)\s*=\s*(["'])(\/[^"']+)\2/gi,
    (_all, attr: string, quote: string, url: string) =>
      ` ${attr}=${quote}${TEC_ORIGIN}${url}${quote}`
  )
  return out.trim()
}

function stripTags(html: string) {
  return sanitizeTecHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function optionPlain(raw: string) {
  const safe = sanitizeTecHtml(raw)
  const text = stripTags(safe)
  if (text) return text
  const src = safe.match(/<img\b[^>]*\ssrc=["']([^"']+)["']/i)
  return src?.[1] || ""
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
}

function readYear(value: unknown): number | null {
  if (value == null || value === "") return null
  const year = Number(value)
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null
  return year
}

function inferType(options: { label: string; text: string }[]): QuestionType {
  if (options.length !== 2) return "multiple_choice"
  const blob = options.map((option) => `${option.label} ${option.text}`.toLowerCase()).join(" ")
  if (/\bcerto\b/.test(blob) && /\berrado\b/.test(blob)) return "certo_errado"
  return "multiple_choice"
}

function normalizeAnswer(raw: string, type: QuestionType) {
  const text = raw.trim()
  if (type === "certo_errado") {
    if (/^(certo|c)$/i.test(text)) return "Certo"
    if (/^(errado|e)$/i.test(text)) return "Errado"
    return ""
  }
  const letter = text.match(/^([A-E])\b/i)
  return letter ? letter[1].toUpperCase() : ""
}

function normalizeOptions(raw: unknown, type: QuestionType) {
  const rows = Array.isArray(raw) ? raw : []
  const options = rows.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const label = cleanText(row.label)
    const text = optionPlain(cleanText(row.text))
    if (!label && !text) return []
    return [{ label, text }]
  })

  if (type === "certo_errado") {
    return [
      { label: "Certo", text: "Certo" },
      { label: "Errado", text: "Errado" },
    ]
  }

  return options
    .map((option, index) => ({
      label: /^[A-E]$/i.test(option.label)
        ? option.label.toUpperCase()
        : String.fromCharCode(65 + index),
      text: option.text,
    }))
    .filter((option) => option.text)
}

export function parseTecIds(raw: unknown) {
  if (!Array.isArray(raw)) throw new Error("Informe a lista de questões.")
  const ids = [...new Set(raw.map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0))]
  if (ids.length > 100) throw new Error("Consulte no máximo 100 questões por vez.")
  return ids
}

export function toImportQuestion(raw: unknown): ImportQuestionInput {
  if (!raw || typeof raw !== "object") throw new Error("Questão inválida.")
  const body = raw as Record<string, unknown>
  const tecId = Number(body.tec_id)
  if (!Number.isInteger(tecId) || tecId <= 0) throw new Error("tec_id inválido.")

  const statement = sanitizeTecHtml(cleanText(body.statement)).slice(0, 200_000)
  const statementText = stripTags(statement)
  if (!statementText && !/<img\b/i.test(statement)) throw new Error("Enunciado vazio.")

  const hintedType = body.type === "certo_errado" ? "certo_errado" : body.type === "multiple_choice" ? "multiple_choice" : null
  const draftOptions = normalizeOptions(body.options, hintedType === "certo_errado" ? "certo_errado" : "multiple_choice")
  const type = hintedType ?? inferType(draftOptions)
  const options = type === "certo_errado"
    ? normalizeOptions(body.options, "certo_errado")
    : draftOptions

  const correct = normalizeAnswer(cleanText(body.correct_answer), type)
  if (!correct) throw new Error("Gabarito ausente.")

  if (type === "multiple_choice" && options.length < 2) {
    throw new Error("Alternativas insuficientes.")
  }
  if (type === "multiple_choice" && !options.some((option) => option.label === correct)) {
    throw new Error("O gabarito não corresponde a uma alternativa.")
  }

  return {
    index: 0,
    tec_id: tecId,
    tec_url: `${TEC_ORIGIN}/questoes/${tecId}`,
    type,
    banca: cleanText(body.banca),
    cargo: cleanText(body.cargo),
    orgao: cleanText(body.orgao),
    ano: readYear(body.ano),
    tec_subject: cleanText(body.tec_subject),
    tec_topic: cleanText(body.tec_topic),
    statement,
    options,
    correct_answer: correct,
    replace_in_bank: false,
  }
}
