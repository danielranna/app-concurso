/**
 * Re-aplica capTopicLeak em questões com tec_topic longo ou inválido.
 * Uso: npx tsx scripts/reparse-dirty-tec-topics.mts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js"
import { capTopicLeak } from "../lib/tec-pdf-parser"

const dryRun = process.argv.includes("--dry-run")

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(url, key)

const { data: rows, error } = await supabase
  .from("questions")
  .select("id, tec_subject, tec_topic, statement")
  .not("tec_topic", "is", null)

if (error) {
  console.error(error.message)
  process.exit(1)
}

let updated = 0
for (const row of rows ?? []) {
  const topic = (row.tec_topic as string)?.trim() ?? ""
  if (!topic || topic.length < 70) continue

  const { topic: clean, rest } = capTopicLeak(topic, "")
  if (clean === topic || clean.length >= topic.length) continue

  const patch = { tec_topic: clean }
  if (dryRun) {
    console.log("would fix", row.id, topic.slice(0, 60), "→", clean)
  } else {
    const { error: upErr } = await supabase
      .from("questions")
      .update(patch)
      .eq("id", row.id)
    if (upErr) console.error(row.id, upErr.message)
    else updated++
  }
}

console.log(dryRun ? "dry-run done" : `updated ${updated} questions`)
