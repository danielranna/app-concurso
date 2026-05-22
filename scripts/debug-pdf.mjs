import fs from "fs"
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const pdfParse = require("pdf-parse/lib/pdf-parse.js")

const path =
  "c:/Users/Daniel Ranna/Desktop/cadernoq/Tec Concursos - Questões para concursos, provas, editais, simulados_.pdf"

const buf = fs.readFileSync(path)
const { text } = await pdfParse(buf)
console.log("LEN", text.length)
console.log("---HEAD 2000---")
console.log(text.slice(0, 2000))
for (const id of ["1414224", "2588914", "1125528", "1143712"]) {
  const i = text.indexOf(id)
  console.log("---Q", id, "---")
  console.log(text.slice(i, i + 750))
}
