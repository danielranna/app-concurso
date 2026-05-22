import fs from "fs"
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const pdfParse = require("pdf-parse/lib/pdf-parse.js")

const path =
  "c:/Users/Daniel Ranna/Desktop/cadernoq/Tec Concursos - Questões para concursos, provas, editais, simulados_.pdf"

const { parseTecPdfText } = await import("../lib/tec-pdf-parser.ts")

const buf = fs.readFileSync(path)
const { text } = await pdfParse(buf)
const p = parseTecPdfText(text)
console.log("name:", p.name)
console.log("count:", p.questions.length)
for (const q of p.questions) {
  console.log(`#${q.tec_id} topic(${q.tec_topic?.length}):`, q.tec_topic?.slice(0, 70))
  console.log("  stmt:", q.statement?.slice(0, 55))
}
