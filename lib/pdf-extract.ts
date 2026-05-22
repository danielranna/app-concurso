import { createRequire } from "module"
import { join } from "path"

const require = createRequire(join(process.cwd(), "package.json"))

type PdfParseFn = (buffer: Buffer) => Promise<{ text: string; numpages: number }>

/** Extração de texto em Node/Vercel (sem worker do pdfjs). */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = require("pdf-parse") as PdfParseFn
  const result = await pdfParse(buffer)
  return result.text ?? ""
}
