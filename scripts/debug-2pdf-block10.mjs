import fs from "fs"
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const pdfParse = require("pdf-parse/lib/pdf-parse.js")
const {
  parseTecPdfText,
  compactPdfText,
  splitTaxonomyAndStatement,
} = await import("../lib/tec-pdf-parser.ts")

const FILE =
  "c:/Users/Daniel Ranna/Desktop/cadernoq/Tec Concursos - Questões para concursos, provas, editais, simulados_2.pdf"

const { text: raw } = await pdfParse(fs.readFileSync(FILE))
const compact = compactPdfText(raw)
const gab = compact.search(/\bGabarito\b/i)
const body = compact.slice(0, gab)

const TEC_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/questoes\/(\d+)/gi
const indices = []
let m
while ((m = TEC_URL_RE.exec(body)) !== null) indices.push({ pos: m.index, id: m[1] })

for (const bi of [8, 9, 10]) {
  const start = indices[bi].pos
  const end = indices[bi + 1]?.pos ?? body.length
  const block = body.slice(start, end)
  console.log(`\n======== BLOCK ${bi + 1} id ${indices[bi].id} len=${block.length} ========`)
  console.log(block.slice(0, 400))
  console.log("... tail:", block.slice(-200))

  const urlMatch = block.match(
    /(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/questoes\/(\d+)/i
  )
  const afterUrl = block.slice(block.indexOf(urlMatch[0]) + urlMatch[0].length).trim()
  const metaMatch = afterUrl.match(/^(.+?\/\d{4})\s*([\s\S]*)$/m)
  if (!metaMatch) {
    console.log("NO META")
    continue
  }
  const { taxonomyLine, rest: afterTax } = splitTaxonomyAndStatement(metaMatch[2].trim())
  const flat = afterTax.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
  console.log("taxonomy:", taxonomyLine.slice(0, 80))
  console.log("rest head:", flat.slice(0, 120))
  console.log("MCQ re:", /\s[a-e]\)\s+/i.test(flat))
  const fo = flat.search(/\s[a-e]\)\s+/i)
  console.log("first opt at:", fo)
}

const p = parseTecPdfText(raw)
console.log("\nparse result:", p.questions.length, p.warnings)
