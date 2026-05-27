/**
 * Processa até N PDFs por usuário (cron na VPS) — modo auto.
 * Uso: node scripts/process-queue-once.js
 *
 * Env:
 *   INGEST_CRON_USER_IDS=uuid1,uuid2  (obrigatório)
 *   INGEST_CRON_MAX_PER_USER=20       (opcional, default 20)
 *   INGEST_CRON_MAX_SECONDS=540        (opcional, default 540 por execução)
 */
import "dotenv/config"
import { loadConfig } from "../src/config.js"
import { getServiceClient } from "../src/supabase.js"
import { runIngestBatch } from "../src/ingest/worker.js"

const config = loadConfig()
const supabase = getServiceClient(config)

const userIds = (process.env.INGEST_CRON_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const maxPerUser = Number(process.env.INGEST_CRON_MAX_PER_USER || 20)
const maxSeconds = Number(process.env.INGEST_CRON_MAX_SECONDS || 540)

if (!userIds.length) {
  console.error("Defina INGEST_CRON_USER_IDS no .env")
  process.exit(1)
}

for (const userId of userIds) {
  console.log(`[cron] user=${userId} auto batch max_docs=${maxPerUser}`)
  const result = await runIngestBatch(supabase, config, userId, {
    max_documents: maxPerUser,
    max_seconds: maxSeconds,
  })
  console.log(
    `[cron] done processed=${result.processed} ok=${result.ok} failed=${result.failed} reason=${result.stopped_reason}`
  )
}

console.log("[cron] finished")
