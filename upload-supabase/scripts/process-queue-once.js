/**
 * Processa até N PDFs por usuário (cron na VPS).
 * Uso: node scripts/process-queue-once.js
 *
 * Env:
 *   INGEST_CRON_USER_IDS=uuid1,uuid2  (obrigatório)
 *   INGEST_CRON_MAX_PER_USER=3       (opcional, default 3)
 */
import "dotenv/config"
import { loadConfig } from "../src/config.js"
import { getServiceClient } from "../src/supabase.js"
import { processNextIngestDocument } from "../src/ingest/worker.js"

const config = loadConfig()
const supabase = getServiceClient(config)

const userIds = (process.env.INGEST_CRON_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const maxPerUser = Number(process.env.INGEST_CRON_MAX_PER_USER || 3)

if (!userIds.length) {
  console.error("Defina INGEST_CRON_USER_IDS no .env")
  process.exit(1)
}

for (const userId of userIds) {
  console.log(`[cron] user=${userId}`)
  for (let i = 0; i < maxPerUser; i++) {
    const result = await processNextIngestDocument(supabase, config, userId)
    console.log(`  #${i + 1} status=${result.status}`, result.document_id ?? "")
    if (result.status === "idle") break
    if (result.status === "retry") break
  }
}

console.log("[cron] done")
