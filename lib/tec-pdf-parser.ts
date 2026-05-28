import type { ParsedTecNotebook, ParsedTecQuestion, QuestionType } from "./question-types"
import { extractPdfText } from "./pdf-extract"
import { repairPdfSpuriousSpaces } from "./pdf-text-repair"

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

/** Após "julgue … .", quebra parágrafo antes do corpo do item (CEBRASPE). */
function formatJulgueStatementBreaks(statement: string): string {
  if (!/\bjulgue\b/i.test(statement)) return statement
  return statement.replace(
    /\b(julgue\b[^.]*\.)\s*(?=[A-Za-zÀ-ÿ])/gi,
    (_, intro: string) => `${intro}\n\n`
  )
}

/** Remove numeração de gabarito vazada nas alternativas (ex.: "Certo 6) 7)"). */
function cleanAlternativeText(text: string): string {
  return repairPdfSpuriousSpaces(
    text
      .replace(/^(?:\d+\)\s*)+/g, "")
      .replace(/\s+\d+\)(?:\s+\d+\))*\s*$/g, "")
      .trim()
  )
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

/** Preserva quebras de linha; compacta só espaços horizontais dentro de cada linha. */
export function compactPdfText(rawText: string): string {
  return repairPdfSpuriousSpaces(
    rawText
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
      .join("\n")
  )
}

function flattenText(text: string): string {
  return text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
}

/** Opções do parser: primary (padrão), lines (preserva quebras), strict (splits conservadores). */
export type TecParserOptions = {
  flattenBody: boolean
  strictOptions: boolean
}

export const TEC_PARSER_PRIMARY: TecParserOptions = {
  flattenBody: true,
  strictOptions: false,
}

export const TEC_PARSER_LINES: TecParserOptions = {
  flattenBody: false,
  strictOptions: false,
}

export const TEC_PARSER_STRICT: TecParserOptions = {
  flattenBody: true,
  strictOptions: true,
}

function normalizeField(text: string, flattenBody: boolean): string {
  if (flattenBody) return flattenText(text)
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .trim()
}

export type TecPdfExtracted = {
  compact: string
  name: string
  share_url: string | null
  ordering: string | null
  answers: Map<number, string>
  blocks: string[]
}

/** Extrai texto compacto, cabeçalho, gabarito e blocos (compartilhado entre variantes). */
export function extractTecPdfStructure(rawText: string): TecPdfExtracted {
  const compact = compactPdfText(rawText)
  const flat = flattenText(compact)
  const { name, share_url, ordering } = extractNotebookHeader(flat)
  const gabaritoStart = compact.search(/\bGabarito\b/i)
  const body = gabaritoStart >= 0 ? compact.slice(0, gabaritoStart) : compact
  const gabaritoBlock = gabaritoStart >= 0 ? compact.slice(gabaritoStart) : ""
  const answers = parseGabarito(flattenText(gabaritoBlock))
  const blocks = splitQuestionBlocks(body)
  return { compact, name, share_url, ordering, answers, blocks }
}

export function parseTecPdfText(
  rawText: string,
  parserOpts: TecParserOptions = TEC_PARSER_PRIMARY
): ParsedTecNotebook {
  const warnings: string[] = []
  const { name, share_url, ordering, answers, blocks } = extractTecPdfStructure(rawText)

  const questions: ParsedTecQuestion[] = []
  blocks.forEach((block, i) => {
    try {
      const q = parseQuestionBlock(block, i + 1, parserOpts)
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

export function parseTecPdfTextLines(rawText: string): ParsedTecNotebook {
  return parseTecPdfText(rawText, TEC_PARSER_LINES)
}

export function parseTecPdfTextStrict(rawText: string): ParsedTecNotebook {
  return parseTecPdfText(rawText, TEC_PARSER_STRICT)
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

export function splitQuestionBlocks(body: string): string[] {
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

const ENUNCIADO_PHRASES =
  "A seguir|Considerando(?:-se)?|No que se refere|No que diz respeito|No argumento seguinte|" +
  "A respeito(?: de)?|Acerca (?:de |das |do )?|À luz (?:de |das |do )?|Julgue o|Assinale a(?: opção)?|" +
  "Em relação(?: a)?|Com relação|Com respeito a|Com base(?: nas| no)?|Tendo em vista|Diante do|Segundo o|" +
  "De acordo com|Sabendo que|Suponha que|Considere que|Observe que|As normas|As fontes|Dadas as|Elemento|Fluxos|" +
  "No tocante|Relativamente|Nos termos(?: do| da)?|Analise|Qual a|Qual o|Para responder|Conforme (?:a|o) |" +
  "Quando utiliza|Quando o|Em um|Em nova|Um Auditor|Uma empresa|A empresa|A secretaria|O objetivo|" +
  "O auditor|O Estado|O ato|O lançamento|A função|A Sociedade|A Constituição|A fiscalização|A atitude|" +
  "O sistema|Ocorrerá|Independentemente|Isenção|São modalidades|Decretada|Determin|Informe se|Talvez uma|" +
  "O sistema organizacional|A propósito|O ato administrativo|A avaliação|A publicidade|A atuação|A deficiência|" +
  "A frase|Tenho-me|Certo dia|A obtenção|A Sociedade Empresária|Nessa situação|Isenção do|Com o objetivo|" +
  "O diretor|Ao examinar|Ao lidar|O item que|No Brasil|É modalidade|Quanto ao|O Princípio|um município|Um município|" +
  "Um Auditor(?: Fiscal)?|Considere a|um município está|Um município está|O processo|" +
  "A administração|O poder|O poder-dever|" +
  "[A-ZÁÉÍÓÚÃÕÇ][a-záéíóúãõçÁÉÍÓÚÃÕÇ-]* ficou"

const ENUNCIADO_LINE_START_RE = new RegExp(
  `^(?:\\d+\\)\\s|(?:Texto\\s+[A-Z0-9][\\w.-]*)\\s*|(?:[\u201c\u201d"]\\s*)?P:\\s*|Proposição\\s+P:\\s*|(?:${ENUNCIADO_PHRASES}))`,
  "i"
)

/** Início do enunciado (texto colado na mesma linha do assunto). */
const STATEMENT_START_RE = new RegExp(
  `\\s(?:(?:Texto\\s+[A-Z0-9][\\w.-]*)\\s*|(?:\\d+\\)\\s*)+(?=Considerando|No\\s|A\\s)|(?:\\d+\\)\\s+)?(?:[\u201c\u201d"]\\s*)?P:\\s*|Proposição\\s+P:\\s*|(?:${ENUNCIADO_PHRASES}))`,
  "i"
)

/** Busca N) só no início do trecho (evita números no meio do enunciado). */
const TAIL_ITEM_NUMBER_RE = /\s(\d+\)\s)/
const TAIL_NUMBER_LOOKAHEAD = 220

const MCQ_STMT_FALLBACK_RE =
  /\s(Elemento\s|Fluxos\s|As normas\b|As fontes\b|A\s+(?:Lei|resolução|portaria|Constituição|medida|norma|seguinte|figura|tabela|frase|opção)|O\s+(?:modelo|item|texto|serviço|processo|princípio|diretor|sistema|a|o|e)\b|Na\s|No\s|Em\s|Um\s|Uma\s)/i

/** Enunciado colado ao assunto, antes das alternativas a)–e). */
const STATEMENT_BEFORE_OPTIONS_RE =
  /\s(?:(?:As|Os)\s+(?!-)|Assinale|Considerando|Uma empresa|Um\s|Uma\s|A\s+(?:empresa|secretaria|função|frase|obtenção|propósito|administração)\b|O\s+(?:objetivo|auditor|Estado|ato|sistema|processo|poder)\b|Em\s|No\s|Na\s|Para\s|Nessa\s)/i

const MCQ_OPTION_LINE_RE = /^[a-e]\)\s/i

function isEnunciadoLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  return ENUNCIADO_LINE_START_RE.test(t)
}

function cleanMetaLine(line: string): string {
  return line
    .replace(/^(?:\d+\)\s*)+/g, "")
    .replace(/\bGabarito\b[\s\S]*$/i, "")
    .trim()
}

const MCQ_OPTION_RE = /\s[a-e]\)\s+/i

function splitTopicFromStatement(tail: string): { topic: string; statementPart: string } {
  let idx = tail.search(STATEMENT_START_RE)
  if (idx < 0) idx = tail.search(MCQ_STMT_FALLBACK_RE)
  if (idx < 0) {
    const optIdx = tail.search(MCQ_OPTION_RE)
    if (optIdx > 0) {
      const beforeOpts = tail.slice(0, optIdx)
      let idx2 = beforeOpts.search(STATEMENT_START_RE)
      if (idx2 < 0) idx2 = beforeOpts.search(MCQ_STMT_FALLBACK_RE)
      if (idx2 > 0) {
        return {
          topic: beforeOpts.slice(0, idx2).trim(),
          statementPart: tail.slice(idx2).trim(),
        }
      }
      const idx3 = beforeOpts.search(STATEMENT_BEFORE_OPTIONS_RE)
      if (idx3 > 8) {
        return {
          topic: beforeOpts.slice(0, idx3).trim(),
          statementPart: tail.slice(idx3).trim(),
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

function splitTaxonomyByLines(afterMeta: string): {
  taxonomyLine: string
  rest: string
} | null {
  if (!afterMeta.includes("\n")) return null

  const lines = afterMeta.split("\n").map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return null

  const firstStmt = lines.findIndex((l) => isEnunciadoLine(l))
  if (firstStmt > 0) {
    const taxLines = lines.slice(0, firstStmt).filter((l) => l.includes(" - "))
    if (taxLines.length === 0) return null
    return {
      taxonomyLine: taxLines.join(" "),
      rest: lines.slice(firstStmt).join("\n"),
    }
  }

  const optLine = lines.findIndex((l) => MCQ_OPTION_LINE_RE.test(l))
  if (optLine > 1) {
    const taxLines = lines.slice(0, optLine).filter((l) => l.includes(" - "))
    if (taxLines.length === 0) return null
    const stmtLines = lines.slice(taxLines.length, optLine)
    return {
      taxonomyLine: taxLines.join(" "),
      rest: [...stmtLines, ...lines.slice(optLine)].join("\n"),
    }
  }

  return null
}

function splitTaxonomySingleLine(
  afterMeta: string,
  flattenBody: boolean,
  strictOptions: boolean
): {
  taxonomyLine: string
  rest: string
} {
  const trimmed = flattenBody ? flattenText(afterMeta) : normalizeField(afterMeta, false)
  if (!trimmed) return { taxonomyLine: "", rest: "" }

  const dash = trimmed.search(/\s+-\s+/)
  if (dash < 0) return { taxonomyLine: trimmed, rest: "" }
  const subject = trimmed.slice(0, dash).trim()
  const tail = trimmed.slice(dash + 3).trim()

  const tailHead = tail.slice(0, TAIL_NUMBER_LOOKAHEAD)
  const qNum = tailHead.match(TAIL_ITEM_NUMBER_RE)
  if (qNum && qNum.index != null) {
    const topic = tail.slice(0, qNum.index).trim()
    const rest = tail.slice(qNum.index).trim()
    return {
      taxonomyLine: topic ? `${subject} - ${topic}` : subject,
      rest,
    }
  }

  const { topic, statementPart } = splitTopicFromStatement(tail)
  const taxonomyLine = topic ? `${subject} - ${topic}` : subject
  return { taxonomyLine, rest: statementPart }
}

/**
 * Matéria - Assunto: linha(s) após meta; enunciado na linha seguinte ou após N).
 */
export function splitTaxonomyAndStatement(
  afterMeta: string,
  parserOpts: TecParserOptions = TEC_PARSER_PRIMARY
): {
  taxonomyLine: string
  rest: string
} {
  const trimmed = afterMeta.trim()
  if (!trimmed) return { taxonomyLine: "", rest: "" }

  const byLines = splitTaxonomyByLines(trimmed)
  if (byLines) return byLines

  if (parserOpts.strictOptions) {
    const taxLines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes(" - "))
    if (taxLines.length > 0) {
      const restLines = trimmed
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !taxLines.includes(l))
      return {
        taxonomyLine: taxLines.join(" "),
        rest: restLines.join("\n"),
      }
    }
  }

  return splitTaxonomySingleLine(trimmed, parserOpts.flattenBody, parserOpts.strictOptions)
}

function parseMcqOptionsInline(rest: string): {
  statement: string
  options: { label: string; text: string }[]
} {
  const firstOpt = rest.search(MCQ_OPTION_RE)
  if (firstOpt < 0) throw new Error("alternativas não encontradas")
  const statement = rest.slice(0, firstOpt).trim()
  const optsPart = rest.slice(firstOpt).trim()
  const options: { label: string; text: string }[] = []
  const optRe = /([a-e])\)\s+([\s\S]*?)(?=\s[a-e]\)\s+|$)/gi
  let om: RegExpExecArray | null
  while ((om = optRe.exec(optsPart)) !== null) {
    options.push({ label: om[1].toUpperCase(), text: om[2].trim() })
  }
  if (options.length === 0) throw new Error("nenhuma alternativa parseada")
  return { statement, options }
}

function parseMcqOptionsFromLines(rest: string): {
  statement: string
  options: { label: string; text: string }[]
} {
  const lines = rest.split("\n")
  const optStart = lines.findIndex((l) => MCQ_OPTION_LINE_RE.test(l.trim()))
  if (optStart < 0) throw new Error("alternativas não encontradas (strict)")
  const statement = lines
    .slice(0, optStart)
    .join("\n")
    .trim()
    .replace(/^(?:\d+\)\s*)+/, "")
    .trim()
  const options: { label: string; text: string }[] = []
  for (let i = optStart; i < lines.length; i++) {
    const m = lines[i].trim().match(/^([a-e])\)\s+(.+)$/i)
    if (m) {
      options.push({ label: m[1].toUpperCase(), text: m[2].trim() })
    }
  }
  if (options.length === 0) throw new Error("nenhuma alternativa parseada (strict)")
  return { statement, options }
}

export function parseQuestionBlock(
  block: string,
  index: number,
  parserOpts: TecParserOptions = TEC_PARSER_PRIMARY
): ParsedTecQuestion {
  const urlMatch = block.match(
    /(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/questoes\/(\d+)/i
  )
  if (!urlMatch) throw new Error("URL TEC não encontrada")
  const tec_id = parseInt(urlMatch[1], 10)
  const tec_url = `https://www.tecconcursos.com.br/questoes/${tec_id}`

  const afterUrl = block.slice(block.indexOf(urlMatch[0]) + urlMatch[0].length).trim()

  const metaMatch = afterUrl.match(/^(.+?\/\d{4})\s*([\s\S]*)$/m)
  if (!metaMatch) throw new Error("metadados (banca/cargo/ano) não encontrados")

  const metaLine = cleanMetaLine(flattenText(metaMatch[1]))
  const { taxonomyLine, rest: afterTaxonomy } = splitTaxonomyAndStatement(
    metaMatch[2].trim(),
    parserOpts
  )
  let rest = normalizeField(afterTaxonomy, parserOpts.flattenBody)

  const { banca, cargo, orgao, ano } = parseMetaLine(metaLine)
  let { tec_subject, tec_topic } = parseTaxonomyLine(taxonomyLine)
  const capped = capTopicLeak(tec_topic, rest)
  tec_topic = capped.topic
  rest = capped.rest

  const hasMcqOptions = parserOpts.strictOptions
    ? rest.split("\n").some((l) => MCQ_OPTION_LINE_RE.test(l.trim()))
    : MCQ_OPTION_RE.test(rest)
  const isCertoErrado =
    !hasMcqOptions && /\bCerto\b/.test(rest) && /\bErrado\b/.test(rest)
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
  } else if (parserOpts.strictOptions) {
    try {
      const parsed = parseMcqOptionsFromLines(rest)
      statement = parsed.statement
      options = parsed.options
    } catch {
      const parsed = parseMcqOptionsInline(rest)
      statement = parsed.statement
      options = parsed.options
    }
  } else {
    const parsed = parseMcqOptionsInline(rest)
    statement = parsed.statement
    options = parsed.options
  }

  statement = repairPdfSpuriousSpaces(formatJulgueStatementBreaks(statement))
  options = options.map((o) => ({
    ...o,
    text: cleanAlternativeText(o.text),
  }))

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

/** Assunto colado após ")" final do título (ex.: "...Acessória) Um Auditor..."). */
function capTopicLeak(topic: string, rest: string): { topic: string; rest: string } {
  let splitAt = -1
  for (const m of topic.matchAll(/\)\s+/g)) {
    const after = topic.slice(m.index! + m[0].length)
    if (/^(?:um |Um |A |O |An |No |Um Auditor)/i.test(after)) {
      splitAt = m.index! + 1
    }
  }
  if (splitAt > 0) {
    return {
      topic: topic.slice(0, splitAt).trim(),
      rest: (topic.slice(splitAt).trim() + (rest ? " " + rest : "")).trim(),
    }
  }
  return { topic, rest }
}

function parseTaxonomyLine(line: string): {
  tec_subject: string
  tec_topic: string
} {
  const idx = line.indexOf(" - ")
  if (idx < 0) return { tec_subject: line.trim(), tec_topic: "" }
  const rawTopic = line.slice(idx + 3).trim()
  const { topic } = capTopicLeak(rawTopic, "")
  return {
    tec_subject: line.slice(0, idx).trim(),
    tec_topic: topic,
  }
}

/** Insere quebras antes de a)–e) colados (melhora strict/lines em MCQ). */
export function normalizeMcqOptionLineBreaks(block: string): string {
  const hasMcqLabels =
    /[a-e]\)\s+/i.test(block) && /[b-e]\)\s+/i.test(block)
  const certoErradoOnly =
    /\bCerto\b/.test(block) &&
    /\bErrado\b/.test(block) &&
    !/[a-e]\)\s+[a-z]/i.test(block)
  if (!hasMcqLabels || certoErradoOnly) return block
  return block.replace(/(\s)([a-e])\)\s+/gi, "\n$2) ")
}

export async function parseTecPdf(buffer: Buffer): Promise<ParsedTecNotebook> {
  const text = await extractPdfText(buffer)
  return parseTecPdfText(text)
}
