import fs from "fs"
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const pdfParse = require("pdf-parse/lib/pdf-parse.js")
const { parseTecPdfText } = await import("../lib/tec-pdf-parser.ts")

const FILE =
  "c:/Users/Daniel Ranna/Desktop/cadernoq/Tec Concursos - Questões para concursos, provas, editais, simulados_2.pdf"

const buf = fs.readFileSync(FILE)
const { text } = await pdfParse(buf)
const p = parseTecPdfText(text)
console.log("name:", p.name)
console.log("questions", p.questions.length)
console.log("warnings", p.warnings)

const urls = [...text.matchAll(/questoes\/(\d+)/gi)]
console.log("url count", urls.length)
const ids = urls.map((m) => m[1])
console.log("ids", ids.join(", "))

const gabStart = text.search(/\bGabarito\b/i)
console.log("\ngabarito snippet:", text.slice(gabStart, gabStart + 500).replace(/\n/g, " | "))

for (const n of [9, 10, 11]) {
  const id = ids[n]
  if (!id) continue
  const i = text.indexOf(id)
  const next = ids[n + 1] ? text.indexOf(ids[n + 1]) : text.length
  const start = Math.max(0, text.lastIndexOf("questoes", i) - 80)
  console.log(`\n=== block ${n + 1} id ${id} ===`)
  console.log(text.slice(start, next > 0 ? next : i + 2000))
}

for (const q of p.questions) {
  if (!q.options?.length) console.log("NO OPTIONS:", q.order_in_pdf, q.tec_id, q.type)
}
