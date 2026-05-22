import fs from "fs"
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const pdfParse = require("pdf-parse/lib/pdf-parse.js")
const { parseTecPdfText } = await import("../lib/tec-pdf-parser.ts")

const buf = fs.readFileSync("c:/Users/Daniel Ranna/Desktop/cadernoq/4.pdf")
const { text } = await pdfParse(buf)
const p = parseTecPdfText(text)
console.log("questions", p.questions.length)
console.log("warnings", p.warnings)
const urls = [...text.matchAll(/questoes\/(\d+)/gi)]
console.log("url count", urls.length)

const gabStart = text.search(/\bGabarito\b/i)
const gab = text.slice(gabStart, gabStart + 400)
console.log("gabarito snippet:", gab.replace(/\n/g, " | "))

// last blocks - find 16th url
const ids = urls.map((m) => m[1])
console.log("ids", ids.join(", "))
const lastId = ids[15]
if (lastId) {
  const i = text.indexOf(lastId)
  console.log("\n=== block 16 raw ===")
  const next = ids[16] ? text.indexOf(ids[16]) : text.length
  const start = text.lastIndexOf("questoes", i)
  console.log(text.slice(start > i - 50 ? i - 50 : start, next > 0 ? next : i + 1500).replace(/\n/g, "\n"))
}
