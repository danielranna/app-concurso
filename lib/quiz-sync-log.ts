import { supabaseServer } from "./supabase-server"

const PAYLOAD_MAX = 8000

export type QuizSyncLogInput = {
  direction: "in" | "out"
  kind: string
  ok?: boolean | null
  http_status?: number | null
  pending?: boolean | null
  reason?: string | null
  caderno_id?: number | null
  tec_id?: number | null
  user_jid?: string | null
  payload?: unknown
}

export function capQuizSyncPayload(value: unknown, max = PAYLOAD_MAX): unknown {
  try {
    const s = JSON.stringify(value)
    if (!s) return null
    if (s.length <= max) return JSON.parse(s)
    return { truncated: true, preview: s.slice(0, max) }
  } catch {
    return { unserializable: true }
  }
}

export async function logQuizSyncEvent(input: QuizSyncLogInput): Promise<void> {
  try {
    const { error } = await supabaseServer.from("quiz_sync_event_log").insert({
      direction: input.direction,
      kind: input.kind,
      ok: input.ok ?? null,
      http_status: input.http_status ?? null,
      pending: input.pending ?? null,
      reason: input.reason ? String(input.reason).slice(0, 500) : null,
      caderno_id: input.caderno_id ?? null,
      tec_id: input.tec_id ?? null,
      user_jid: input.user_jid ?? null,
      payload: capQuizSyncPayload(input.payload),
    })
    if (error) console.warn("[quiz-sync-log]", error.message)
  } catch (e) {
    console.warn("[quiz-sync-log]", e instanceof Error ? e.message : e)
  }
}
