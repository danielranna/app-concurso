import fs from "fs"
import path from "path"
import { createRequire } from "module"

const require = createRequire(import.meta.url)
const pdfParse = require("pdf-parse/lib/pdf-parse.js")
const { parseTecPdfText } = await import("../lib/tec-pdf-parser.ts")

const PDF_DIR = "c:/Users/Daniel Ranna/Desktop/cadernoq"
const PDF_FILES = [
  "Tec Concursos - Questões para concursos, provas, editais, simulados_.pdf",
  "Tec Concursos - Questões para concursos, provas, editais, simulados_2.pdf",
  "Tec Concursos - Questões para concursos, provas, editais, simulados3_.pdf",
  "4.pdf",
  "5.pdf",
  "6.1.pdf",
  "6.pdf",
  "7.pdf",
  "8.pdf",
]

const BAD_TOPIC_RE =
  /\b(assinale|julgue|opção correta|No que diz|As normas|Considerando|Acerca de|a\))\b/i

function isBadTopic(topic) {
  if (!topic?.trim()) return false
  if (topic.length > 180) return true
  return BAD_TOPIC_RE.test(topic)
}

let totalBad = 0
let totalQ = 0

for (const file of PDF_FILES) {
  const full = path.join(PDF_DIR, file)
  if (!fs.existsSync(full)) {
    console.log("SKIP (missing):", file)
    continue
  }
  const { text } = await pdfParse(fs.readFileSync(full))
  const parsed = parseTecPdfText(text)
  const bad = parsed.questions.filter((q) => isBadTopic(q.tec_topic))
  totalQ += parsed.questions.length
  totalBad += bad.length
  console.log(`\n${file} | ${parsed.name?.slice(0, 55)} | ${parsed.questions.length} q | bad: ${bad.length}`)
  for (const q of bad) {
    console.log(`  #${q.tec_id} topic(${q.tec_topic?.length}): ${q.tec_topic?.slice(0, 90)}`)
    console.log(`       stmt: ${q.statement?.slice(0, 70)}`)
  }
}

console.log(`\n=== TOTAL: ${totalQ} questions, ${totalBad} bad topics ===`)
process.exit(totalBad > 0 ? 1 : 0)
