import type { ParsedTecNotebook, ParsedTecQuestion, QuestionType } from "./question-types"

const TEC_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/questoes\/(\d+)/gi

const GABARITO_LINE_RE =
  /(\d+)\)\s*(Anulada|Certo|Errado|[A-E])/gi

const OPTION_LINE_RE = /^\s*([a-e])\)\s+(.+)$/gim

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const data = new Uint8Array(buffer)
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  let text = ""
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n"
  }
  return text
}

export function parseTecPdfText(rawText: string): ParsedTecNotebook {
  const warnings: string[] = []
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\s+/g, " ")

  const headerMatch = normalized.match(
    /Caderno de Estudo\s+(\S+)?\s*(https:\/\/www\.tecconcursos\.com\.br\/s\/\S+)?/i
  )
  const name = headerMatch?.[1]?.trim() || "Caderno importado"
  const share_url = headerMatch?.[2] ?? null
  const orderingMatch = normalized.match(/Ordenação:\s*([^]+?)(?=www\.tecconcursos|$)/i)
  const ordering = orderingMatch?.[1]?.trim().slice(0, 120) ?? null

  const gabaritoStart = normalized.search(/\bGabarito\b/i)
  const body =
    gabaritoStart >= 0 ? normalized.slice(0, gabaritoStart) : normalized
  const gabaritoBlock =
    gabaritoStart >= 0 ? normalized.slice(gabaritoStart) : ""

  const answers = parseGabarito(gabaritoBlock)
  const blocks = splitQuestionBlocks(body)

  const questions: ParsedTecQuestion[] = []
  blocks.forEach((block, i) => {
    try {
      const q = parseQuestionBlock(block, i + 1)
      const ans = answers.get(q.index)
      if (ans) q.correct_answer = ans
      else warnings.push(`Questão ${q.index} (${q.tec_id}): gabarito não encontrado`)
      questions.push(q)
    } catch (e) {
      warnings.push(
        `Bloco ${i + 1}: ${e instanceof Error ? e.message : "erro ao parsear"}`
      )
    }
  })

  if (questions.length !== answers.size && answers.size > 0) {
    warnings.push(
      `Contagem: ${questions.length} questões no corpo vs ${answers.size} gabaritos`
    )
  }

  return { name, share_url, ordering, questions, warnings }
}

function parseGabarito(block: string): Map<number, string> {
  const map = new Map<number, string>()
  let m: RegExpExecArray | null
  const re = new RegExp(GABARITO_LINE_RE.source, "gi")
  while ((m = re.exec(block)) !== null) {
    const idx = parseInt(m[1], 10)
    let ans = m[2].trim()
    if (/^[a-e]$/i.test(ans)) ans = ans.toUpperCase()
    else if (/^certo$/i.test(ans)) ans = "Certo"
    else if (/^errado$/i.test(ans)) ans = "Errado"
    else if (/^anulada$/i.test(ans)) ans = "Anulada"
    map.set(idx, ans)
  }
  return map
}

function splitQuestionBlocks(body: string): string[] {
  const indices: { pos: number; tecId: string }[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(TEC_URL_RE.source, "gi")
  while ((m = re.exec(body)) !== null) {
    indices.push({ pos: m.index, tecId: m[1] })
  }
  if (indices.length === 0) return []
  const blocks: string[] = []
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].pos
    const end = i + 1 < indices.length ? indices[i + 1].pos : body.length
    blocks.push(body.slice(start, end))
  }
  return blocks
}

function parseQuestionBlock(block: string, index: number): ParsedTecQuestion {
  const urlMatch = block.match(
    /(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/questoes\/(\d+)/i
  )
  if (!urlMatch) throw new Error("URL TEC não encontrada")
  const tec_id = parseInt(urlMatch[1], 10)
  const tec_url = `https://www.tecconcursos.com.br/questoes/${tec_id}`

  const afterUrl = block.slice(block.indexOf(urlMatch[0]) + urlMatch[0].length).trim()

  const yearMatch = afterUrl.match(/\/(\d{4})\b/)
  let metaLine = ""
  let taxonomyLine = ""
  let rest = afterUrl

  if (yearMatch && yearMatch.index != null) {
    const metaEnd = yearMatch.index + yearMatch[0].length
    metaLine = afterUrl.slice(0, metaEnd).trim()
    const afterMeta = afterUrl.slice(metaEnd).trim()
    const certoIdx = afterMeta.search(/\bCerto\b/)
    const firstOptIdx = afterMeta.search(/\s[a-e]\)\s/i)
    const splitIdx =
      certoIdx >= 0 && (firstOptIdx < 0 || certoIdx < firstOptIdx)
        ? certoIdx
        : firstOptIdx

    if (splitIdx > 0) {
      const taxPart = afterMeta.slice(0, splitIdx).trim()
      const taxDash = taxPart.indexOf(" - ")
      if (taxDash > 0) {
        taxonomyLine = taxPart
        rest = afterMeta.slice(splitIdx).trim()
      } else {
        taxonomyLine = taxPart
        rest = afterMeta.slice(splitIdx).trim()
      }
    } else {
      rest = afterMeta
    }
  } else {
    const parts = afterUrl.split(/\s{2,}/)
    metaLine = parts[0] ?? ""
    taxonomyLine = parts[1] ?? ""
    rest = parts.slice(2).join(" ") || afterUrl.slice(metaLine.length + taxonomyLine.length)
  }

  const { banca, cargo, orgao, ano } = parseMetaLine(metaLine)
  const { tec_subject, tec_topic } = parseTaxonomyLine(taxonomyLine)

  const isCertoErrado = /\bCerto\b/.test(rest) && /\bErrado\b/.test(rest)
  const type: QuestionType = isCertoErrado ? "certo_errado" : "multiple_choice"

  let statement = ""
  let options: { label: string; text: string }[] = []

  if (type === "certo_errado") {
    const certoIdx = rest.search(/\bCerto\b/)
    statement = rest.slice(0, certoIdx).trim()
    options = [
      { label: "Certo", text: "Certo" },
      { label: "Errado", text: "Errado" },
    ]
  } else {
    const firstOpt = rest.search(/\s[a-e]\)\s/i)
    if (firstOpt < 0) throw new Error("alternativas não encontradas")
    statement = rest.slice(0, firstOpt).trim()
    const optsPart = rest.slice(firstOpt).trim()
    const optRe = /([a-e])\)\s+([\s\S]*?)(?=\s[a-e]\)\s|$)/gi
    let om: RegExpExecArray | null
    while ((om = optRe.exec(optsPart)) !== null) {
      options.push({
        label: om[1].toUpperCase(),
        text: om[2].trim(),
      })
    }
    if (options.length === 0) throw new Error("nenhuma alternativa parseada")
  }

  return {
    index,
    tec_id,
    tec_url,
    type,
    banca,
    cargo,
    orgao,
    ano,
    tec_subject,
    tec_topic,
    statement,
    options,
    correct_answer: "",
  }
}

function parseMetaLine(line: string): {
  banca: string
  cargo: string
  orgao: string
  ano: number | null
} {
  const yearMatch = line.match(/\/(\d{4})\s*$/)
  const ano = yearMatch ? parseInt(yearMatch[1], 10) : null
  const withoutYear = yearMatch ? line.slice(0, -yearMatch[0].length) : line
  const dashParts = withoutYear.split(/\s*-\s*/)
  const banca = dashParts[0]?.trim() ?? ""
  const rest = dashParts.slice(1).join(" - ").trim()
  const paren = rest.match(/^(.+?)\s*\(([^)]+)\)\s*\/\s*(.+)$/)
  if (paren) {
    return {
      banca,
      cargo: paren[1].trim(),
      orgao: paren[2].trim(),
      ano,
    }
  }
  const slash = rest.split("/").map((s) => s.trim())
  return {
    banca,
    cargo: slash[0] ?? rest,
    orgao: slash[1] ?? "",
    ano,
  }
}

function parseTaxonomyLine(line: string): {
  tec_subject: string
  tec_topic: string
} {
  const idx = line.indexOf(" - ")
  if (idx < 0) return { tec_subject: line.trim(), tec_topic: "" }
  return {
    tec_subject: line.slice(0, idx).trim(),
    tec_topic: line.slice(idx + 3).trim(),
  }
}

export async function parseTecPdf(buffer: Buffer): Promise<ParsedTecNotebook> {
  const text = await extractPdfText(buffer)
  return parseTecPdfText(text)
}
