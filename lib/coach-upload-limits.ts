/** Limite do body em Serverless (Vercel Hobby ~4,5 MB). Um PDF por request. */
export const COACH_UPLOAD_MAX_BYTES = process.env.VERCEL
  ? 4 * 1024 * 1024
  : 20 * 1024 * 1024

export const COACH_UPLOAD_MAX_LABEL = process.env.VERCEL
  ? "4 MB"
  : "20 MB"
