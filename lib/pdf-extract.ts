type PdfParseFn = (buffer: Buffer) => Promise<{ text: string; numpages?: number }>

/**
 * Usa lib/pdf-parse.js (não index.js) para evitar branch de debug do pacote
 * e permitir que o Next inclua o módulo no bundle da função serverless.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: PdfParseFn = require("pdf-parse/lib/pdf-parse.js")

/** Extração de texto em Node/Vercel. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer)
  return result.text ?? ""
}

/** Evita função serverless pendurada em PDFs enormes (ex.: 150+ páginas). */
export async function extractPdfTextWithTimeout(
  buffer: Buffer,
  timeoutMs = 52_000
): Promise<string> {
  return Promise.race([
    extractPdfText(buffer),
    new Promise<string>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              "PDF grande demais para extrair de uma vez (timeout). Divida o arquivo ou use um PDF menor."
            )
          ),
        timeoutMs
      )
    }),
  ])
}
