const required = (name) => {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Variável obrigatória ausente: ${name}`)
  return v
}

export function loadConfig() {
  const supabaseUrl = required("SUPABASE_URL")
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY")
  const anonKey = required("SUPABASE_ANON_KEY")
  const port = Number(process.env.PORT || 3099)
  const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024)
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const sharedSecret = process.env.COACH_UPLOAD_SHARED_SECRET?.trim() || null
  const aiCredentialsSecret =
    process.env.AI_CREDENTIALS_SECRET?.trim() || null
  const ingestTimeoutRaw = process.env.INGEST_PDF_TIMEOUT_MS?.trim()
  const ingestPdfTimeoutMs = ingestTimeoutRaw
    ? Number(ingestTimeoutRaw)
    : 0

  if (!allowedOrigins.length) {
    console.warn(
      "[upload-supabase] ALLOWED_ORIGINS vazio — CORS pode bloquear o navegador."
    )
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    port,
    maxUploadBytes,
    allowedOrigins,
    sharedSecret,
    aiCredentialsSecret,
    ingestPdfTimeoutMs:
      Number.isFinite(ingestPdfTimeoutMs) && ingestPdfTimeoutMs > 0
        ? ingestPdfTimeoutMs
        : 0,
    bucket: "coach-documents",
  }
}
