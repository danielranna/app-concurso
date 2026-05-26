/** Sync com lib/pdf-extract.ts */
import { createRequire } from "module"

const require = createRequire(import.meta.url)
const pdfParse = require("pdf-parse/lib/pdf-parse.js")

export async function extractPdfText(buffer) {
  const result = await pdfParse(buffer)
  return result.text ?? ""
}

export async function extractPdfTextWithTimeout(buffer, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) {
    return extractPdfText(buffer)
  }
  return Promise.race([
    extractPdfText(buffer),
    new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              "PDF grande demais para extrair no tempo limite. Aumente INGEST_PDF_TIMEOUT_MS ou divida o arquivo."
            )
          ),
        timeoutMs
      )
    }),
  ])
}
