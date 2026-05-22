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
