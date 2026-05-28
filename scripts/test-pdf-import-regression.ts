/**
 * Regressão local com os PDFs da Semana 27.05.
 * Uso: npx tsx scripts/test-pdf-import-regression.ts
 */
import { readFileSync, existsSync } from "fs"
import { basename, join } from "path"
import { parseTecPdfPipeline } from "../lib/tec-pdf-parse-pipeline"

const PDF_DIR = "c:/Users/Daniel Ranna/Desktop/Semana 27.05"
const FILES = ["reforma.pdf", "adm.pdf", "cont.pdf", "lte1.pdf", "matfin.pdf"]

async function main() {
  let failed = 0

  for (const file of FILES) {
    const p = join(PDF_DIR, file)
    if (!existsSync(p)) {
      console.warn("SKIP (missing):", p)
      continue
    }
    const buf = readFileSync(p)
    const result = await parseTecPdfPipeline(buf)
    const noAnswer = result.questions.filter((q) => !q.merged.correct_answer).length
    console.log(
      basename(p),
      "| q:",
      result.stats.total,
      "| high:",
      result.stats.high,
      "| review:",
      result.stats.needs_review,
      "| no answer:",
      noAnswer
    )
    if (result.stats.total === 0 || noAnswer > 0) failed++
  }

  if (failed > 0) {
    console.error("REGRESSION FAILED:", failed, "file(s)")
    process.exit(1)
  }
  console.log("PDF import regression OK")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
