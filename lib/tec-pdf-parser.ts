import type { ParsedTecNotebook, ParsedTecQuestion, QuestionType } from "./question-types"
import { extractPdfText } from "./pdf-extract"

const TEC_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/questoes\/(\d+)/gi

const GABARITO_LINE_RE =
  /(\d+)\)\s*(Anulada|Certo|Errado|[A-E])/gi

const OPTION_LINE_RE = /^\s*([a-e])\)\s+(.+)$/gim

const SHARE_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/s\/[A-Za-z0-9]+/i

function normalizeShareUrl(raw: string): string {
  let u = raw.trim()
  if (!/^https?:\/\//i.test(u)) u = `https://${u.replace(/^\/\//, "")}`
  if (!/:\/\/www\./i.test(u)) {
    u = u.replace(/(:\/\/)(tecconcursos\.)/i, "$1www.$2")
  }
  return u
}

const FIRST_QUESTION_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/questoes\/\d+/i

function stripLeadingGabaritoNumbers(s: string): string {
  return s.replace(/^(?:\d+\)\s*)+/g, "").trim()
}

/** Nome do caderno e metadados do cabeçalho TEC (antes das questões). */
export function extractNotebookHeader(normalized: string): {
  name: string
  share_url: string | null
  ordering: string | null
} {
  const firstQ = normalized.search(FIRST_QUESTION_URL_RE)
  const headerRegion =
    firstQ > 0 ? normalized.slice(0, firstQ) : normalized.slice(0, 6000)

  const shareMatch = headerRegion.match(SHARE_URL_RE)
  const share_url = shareMatch ? normalizeShareUrl(shareMatch[0]) : null

  let name = "Caderno importado"
  if (shareMatch && shareMatch.index != null) {
    const before = stripLeadingGabaritoNumbers(
      headerRegion.slice(0, shareMatch.index).trim()
    )
    const oldTitle = before.match(/Caderno de Estudo\s+(\S+)\s*$/i)
    if (oldTitle?.[1]) {
      name = oldTitle[1].trim()
    } else {
      let title = before
        .replace(/tecconcursos/gi, " ")
        .replace(/\bCaderno de Estudo\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
      title = stripLeadingGabaritoNumbers(title)
      const labeled = title.match(
        /\b([A-Z]{2,}\s+-\s+.+?(?:CADERNO\s+\d+|CEBRASPE|FCC|FGV|VUNESP)[\s\S]*?)\s*$/i
      )
      if (labeled?.[1]) name = labeled[1].trim()
      else if (title.length >= 3) name = title
    }
  } else {
    const legacy = headerRegion.match(/Caderno de Estudo\s+(\S+)/i)
    if (legacy?.[1]) name = legacy[1].trim()
  }

  const orderingMatch = headerRegion.match(
    /Ordenação:\s*([^]+?)(?=www\.tecconcursos|\bGabarito\b|$)/i
  )
  const ordering = orderingMatch?.[1]?.trim().slice(0, 120) ?? null

  return { name, share_url, ordering }
}

export function parseTecPdfText(rawText: string): ParsedTecNotebook {
  const warnings: string[] = []
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\s+/g, " ")

  const { name, share_url, ordering } = extractNotebookHeader(normalized)

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

/** Início do enunciado após matéria/assunto (linha extra do TEC ou texto da questão). */
const STATEMENT_START_RE =
  /\s(?:(?:Texto\s+[A-Z0-9][\w.-]*)\s*|(?:\d+\)\s*)+(?=Considerando|No\s|A\s)|(?:\d+\)\s+)?(?:[\u201c\u201d"]\s*)?P:\s*|Proposição\s+P:\s*|(?:A seguir|Considerando(?:-se)?|No que se refere|No argumento seguinte|A respeito de|Acerca de|Julgue o|Assinale a opção|Em relação|Com relação|Com base nas|Com base no|Com base|Tendo em vista|À luz de|Diante do|Segundo o|De acordo com|Sabendo que|Suponha que|Considere que|Observe que)\b)/i

const MCQ_STMT_FALLBACK_RE =
  /\s(A\s+(?:Lei|resolução|portaria|Constituição|medida|norma|seguinte|figura|tabela|frase|opção)|O\s+(?:modelo|item|texto|serviço|processo|princípio|sistema|a|o|e)\b|Na\s|No\s|Em\s|Um\s|Uma\s|As\s|Os\s)/i

function cleanMetaLine(line: string): string {
  return line
    .replace(/^(?:\d+\)\s*)+/g, "")
    .replace(/\bGabarito\b[\s\S]*$/i, "")
    .trim()
}

function splitTopicFromStatement(tail: string): { topic: string; statementPart: string } {
  let idx = tail.search(STATEMENT_START_RE)
  if (idx < 0) idx = tail.search(MCQ_STMT_FALLBACK_RE)
  if (idx < 0) {
    const optIdx = tail.search(/\s[a-e]\)\s/i)
    if (optIdx > 0) {
      const beforeOpts = tail.slice(0, optIdx)
      const idx2 = beforeOpts.search(MCQ_STMT_FALLBACK_RE)
      if (idx2 > 0) {
        return {
          topic: beforeOpts.slice(0, idx2).trim(),
          statementPart: tail.slice(idx2).trim(),
        }
      }
    }
    return { topic: tail, statementPart: "" }
  }
  return {
    topic: tail.slice(0, idx).trim(),
    statementPart: tail.slice(idx).trim(),
  }
}

/** Matéria - Assunto (sem /) e separação do enunciado. */
export function splitTaxonomyAndStatement(afterMeta: string): {
  taxonomyLine: string
  rest: string
} {
  const trimmed = afterMeta.trim()
  const dash = trimmed.search(/\s+-\s+/)
  if (dash < 0) return { taxonomyLine: trimmed, rest: "" }
  const subject = trimmed.slice(0, dash).trim()
  const tail = trimmed.slice(dash + 3).trim()
  const { topic, statementPart } = splitTopicFromStatement(tail)
  const taxonomyLine = topic ? `${subject} - ${topic}` : subject
  return { taxonomyLine, rest: statementPart }
}

function parseQuestionBlock(block: string, index: number): ParsedTecQuestion {
  const urlMatch = block.match(
    /(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/questoes\/(\d+)/i
  )
  if (!urlMatch) throw new Error("URL TEC não encontrada")
  const tec_id = parseInt(urlMatch[1], 10)
  const tec_url = `https://www.tecconcursos.com.br/questoes/${tec_id}`

  const afterUrl = block.slice(block.indexOf(urlMatch[0]) + urlMatch[0].length).trim()

  const metaMatch = afterUrl.match(/^(.+?\/\d{4})\s*([\s\S]*)$/)
  if (!metaMatch) throw new Error("metadados (banca/cargo/ano) não encontrados")

  const metaLine = cleanMetaLine(metaMatch[1])
  const { taxonomyLine, rest: afterTaxonomy } = splitTaxonomyAndStatement(metaMatch[2])

  const { banca, cargo, orgao, ano } = parseMetaLine(metaLine)
  const { tec_subject, tec_topic } = parseTaxonomyLine(taxonomyLine)
  let rest = afterTaxonomy

  const isCertoErrado = /\bCerto\b/.test(rest) && /\bErrado\b/.test(rest)
  const type: QuestionType = isCertoErrado ? "certo_errado" : "multiple_choice"

  let statement = ""
  let options: { label: string; text: string }[] = []

  if (type === "certo_errado") {
    const certoIdx = rest.search(/\bCerto\b/)
    statement = rest
      .slice(0, certoIdx)
      .trim()
      .replace(/^(?:\d+\)\s*)+/, "")
      .trim()
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
  const cleaned = cleanMetaLine(line)
  const yearMatch = cleaned.match(/\/(\d{4})\s*$/)
  const ano = yearMatch ? parseInt(yearMatch[1], 10) : null
  const withoutYear = yearMatch
    ? cleaned.slice(0, cleaned.lastIndexOf(`/${yearMatch[1]}`))
    : cleaned

  const dashIdx = withoutYear.search(/\s+-\s+/)
  const banca = (dashIdx >= 0 ? withoutYear.slice(0, dashIdx) : withoutYear).trim()
  const cargoPath = dashIdx >= 0 ? withoutYear.slice(dashIdx + 3).trim() : ""
  const segments = cargoPath.split("/").map((s) => s.trim()).filter(Boolean)

  return {
    banca,
    cargo: segments[0] ?? "",
    orgao: segments[1] ?? "",
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
