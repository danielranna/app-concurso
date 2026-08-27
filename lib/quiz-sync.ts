import { supabaseServer } from "./supabase-server"
import {
  getQuizBotSecret,
  getQuizCadernoFromJsonUrl,
  getQuizSyncAssistUrl,
  getQuizSyncIngestUrl,
  getQuizSyncAnswersUrl,
  getQuizSyncInventoryUrl,
  getQuizSyncOmissasUrl,
  getQuizSyncStatusUrl,
  getQuizSyncReplayGabaritoUrl,
} from "./quiz-bot-url"
import { capQuizSyncPayload, logQuizSyncEvent } from "./quiz-sync-log"
import {
  computeOutcomeCategory,
  normalizeAnswer,
  parseConfidenceLevel,
  recordAttempt,
  refreshNotebookProgress,
} from "./question-study"
import { createNotebookFromQuestionIds } from "./notebook-from-performance"
import type { ConfidenceLevel } from "./question-types"

export function toWaLetter(type: string, selected: string): string {
  if (type === "certo_errado") {
    if (/^certo$/i.test(selected) || selected.toUpperCase() === "C") return "c"
    return "e"
  }
  return selected.trim().toLowerCase().slice(0, 1)
}

function capDurationMs(ms: unknown): number | null {
  if (ms == null || !Number.isFinite(Number(ms))) return null
  const n = Math.round(Number(ms))
  if (n < 0) return null
  const CAP = 30 * 60 * 1000
  return Math.min(n, CAP)
}

export function fromWaLetter(type: string, letter: string): string {
  const L = letter.trim().toLowerCase()
  const certoErrado =
    type === "certo_errado" ||
    type === "true_false" ||
    L === "certo" ||
    L === "errado" ||
    L.startsWith("certo") ||
    L.startsWith("errado")
  if (certoErrado) {
    if (L === "c" || L.startsWith("certo")) return "Certo"
    if (L === "e" || L.startsWith("errado")) return "Errado"
  }
  return L.toUpperCase().slice(0, 1)
}

function kindFromQuizUrl(url: string): string {
  const u = url.toLowerCase()
  if (u.includes("caderno-from-json") || u.includes("caderno-upload")) return "send"
  if (u.includes("quiz-sync-ingest")) return "ingest"
  if (u.includes("quiz-sync-assist")) return "assist"
  if (u.includes("quiz-sync-omissas")) return "omissas"
  if (u.includes("quiz-sync-inventory")) return "inventory"
  if (u.includes("quiz-sync-answers")) return "answers"
  if (u.includes("quiz-sync-status")) return "status"
  if (u.includes("quiz-sync-replay-gabarito")) return "replay"
  return "out"
}

type QuizFetchMeta = {
  kind?: string
  cadernoId?: number | null
  tecId?: number | null
  userJid?: string | null
}

async function quizFetch(url: string, init?: RequestInit, meta?: QuizFetchMeta) {
  const secret = getQuizBotSecret()
  if (!secret) throw new Error("Configure QUIZ_BOT_USERS_SECRET")
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  const kind = meta?.kind ?? kindFromQuizUrl(url)
  if (kind === "send" || kind === "ingest" || kind === "status" || kind === "unlink" || kind === "replay") {
    let requestBody: unknown = null
    if (typeof init?.body === "string") {
      try {
        requestBody = JSON.parse(init.body)
      } catch {
        requestBody = init.body.slice(0, 500)
      }
    }
    await logQuizSyncEvent({
      direction: "out",
      kind,
      ok: res.ok && !data.pending,
      http_status: res.status,
      pending: Boolean(data.pending),
      reason: data.reason || data.error || null,
      caderno_id: meta?.cadernoId ?? (data.cadernoId != null ? Number(data.cadernoId) : null),
      tec_id: meta?.tecId ?? null,
      user_jid: meta?.userJid ?? null,
      payload: capQuizSyncPayload({ url, request: requestBody, response: data }),
    })
  }
  return { res, data }
}

function jidCandidates(userJid: string): string[] {
  const raw = String(userJid || "").trim()
  if (!raw) return []
  const out = new Set<string>([raw])
  const at = raw.indexOf("@")
  const local = (at >= 0 ? raw.slice(0, at) : raw).trim()
  if (local) {
    out.add(`${local}@s.whatsapp.net`)
    out.add(`${local}@lid`)
  }
  return [...out]
}

export async function resolveUserIdByJid(userJid: string): Promise<string | null> {
  const candidates = jidCandidates(userJid)
  if (!candidates.length) return null
  const { data } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("user_id, whatsapp_jid")
    .eq("whatsapp_authorized", true)
    .in("whatsapp_jid", candidates)
    .limit(1)
    .maybeSingle()
  return data?.user_id ?? null
}

function isUsableDisplayName(value: unknown): value is string {
  const t = String(value || "").trim()
  if (!t) return false
  if (/@/.test(t)) return false
  if (/^\+?\d{8,}$/.test(t)) return false
  return true
}

export async function resolveJidByUserId(userId: string): Promise<string | null> {
  const ident = await resolveWhatsappIdentity(userId)
  return ident?.jid ?? null
}

export async function resolveWhatsappIdentity(
  userId: string
): Promise<{ jid: string; userName: string } | null> {
  const { data } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("whatsapp_jid, whatsapp_display_label, whatsapp_authorized")
    .eq("user_id", userId)
    .maybeSingle()
  if (!data?.whatsapp_jid || data.whatsapp_authorized === false) return null
  return {
    jid: data.whatsapp_jid,
    userName: isUsableDisplayName(data.whatsapp_display_label)
      ? String(data.whatsapp_display_label).trim()
      : "Participante",
  }
}

export async function getSyncForNotebook(notebookId: string) {
  const { data } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("*")
    .eq("notebook_id", notebookId)
    .maybeSingle()
  return data
}

export async function getSentCadernoForNotebook(notebookId: string): Promise<{
  cadernoId: number
  sourceNotebookId: string
} | null> {
  const direct = await getSyncForNotebook(notebookId)
  if (direct?.caderno_id) {
    return { cadernoId: Number(direct.caderno_id), sourceNotebookId: notebookId }
  }
  const { data: replica } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("source_notebook_id")
    .eq("notebook_id", notebookId)
    .maybeSingle()
  if (!replica?.source_notebook_id) return null
  const sync = await getSyncForNotebook(replica.source_notebook_id)
  if (!sync?.caderno_id) return null
  return {
    cadernoId: Number(sync.caderno_id),
    sourceNotebookId: replica.source_notebook_id as string,
  }
}

async function notebooksForCaderno(cadernoId: number): Promise<string[]> {
  const { data: syncs } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("notebook_id")
    .eq("caderno_id", cadernoId)
  const sources = (syncs ?? []).map((s) => s.notebook_id as string)
  if (!sources.length) return []
  const { data: replicas } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("notebook_id")
    .in("source_notebook_id", sources)
  return [...new Set([...sources, ...(replicas ?? []).map((r) => r.notebook_id as string)])]
}

async function resolveSentNotebookForTec(
  userId: string,
  tecId: number,
  cadernoId?: number | null
): Promise<string | null> {
  if (cadernoId) {
    const { data: sync } = await supabaseServer
      .from("quiz_notebook_sync")
      .select("notebook_id")
      .eq("caderno_id", cadernoId)
      .maybeSingle()
    if (sync?.notebook_id) return ensureReplica(sync.notebook_id as string, userId)
  }
  const { data: links } = await supabaseServer
    .from("quiz_question_links")
    .select("notebook_id, caderno_id")
    .eq("tec_id", tecId)
  if (!links?.length) return null
  const cadernoIds = [
    ...new Set(links.map((l) => l.caderno_id).filter((id) => id != null)),
  ]
  if (cadernoIds.length) {
    const { data: syncs } = await supabaseServer
      .from("quiz_notebook_sync")
      .select("notebook_id, caderno_id")
      .in("caderno_id", cadernoIds)
    const sent = syncs?.[0]
    if (sent?.notebook_id) return ensureReplica(sent.notebook_id as string, userId)
  }
  return ensureReplica(links[0].notebook_id as string, userId)
}

type NotebookPick = {
  id: string
  subject_id: string | null
  answered_count: number | null
  created_at: string | null
}

function preferUserNotebook(rows: NotebookPick[]): string | null {
  if (!rows.length) return null
  const ranked = [...rows].sort((a, b) => {
    const aSaved = a.subject_id ? 1 : 0
    const bSaved = b.subject_id ? 1 : 0
    if (aSaved !== bSaved) return bSaved - aSaved
    const aAns = a.answered_count ?? 0
    const bAns = b.answered_count ?? 0
    if (aAns !== bAns) return bAns - aAns
    return String(a.created_at || "").localeCompare(String(b.created_at || ""))
  })
  return ranked[0]?.id ?? null
}

async function cadernoIdForNotebook(notebookId: string): Promise<number | null> {
  const sync = await getSyncForNotebook(notebookId)
  if (sync?.caderno_id != null) return Number(sync.caderno_id)
  const { data: replica } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("source_notebook_id")
    .eq("notebook_id", notebookId)
    .limit(1)
    .maybeSingle()
  if (replica?.source_notebook_id) {
    const srcSync = await getSyncForNotebook(replica.source_notebook_id as string)
    if (srcSync?.caderno_id != null) return Number(srcSync.caderno_id)
  }
  const { data: link } = await supabaseServer
    .from("quiz_question_links")
    .select("caderno_id")
    .eq("notebook_id", notebookId)
    .limit(1)
    .maybeSingle()
  return link?.caderno_id != null ? Number(link.caderno_id) : null
}

async function cadernoIdsForNotebooks(notebookIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const ids = [...new Set(notebookIds.filter(Boolean))]
  if (!ids.length) return out

  const { data: syncs } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("notebook_id, caderno_id")
    .in("notebook_id", ids)
  for (const s of syncs ?? []) {
    if (s.notebook_id && s.caderno_id != null) out.set(s.notebook_id as string, Number(s.caderno_id))
  }

  const missing = ids.filter((id) => !out.has(id))
  if (missing.length) {
    const { data: replicas } = await supabaseServer
      .from("quiz_notebook_replicas")
      .select("notebook_id, source_notebook_id")
      .in("notebook_id", missing)
    const sourceIds = [
      ...new Set((replicas ?? []).map((r) => r.source_notebook_id as string).filter(Boolean)),
    ]
    const sourceCaderno = new Map<string, number>()
    if (sourceIds.length) {
      const { data: srcSyncs } = await supabaseServer
        .from("quiz_notebook_sync")
        .select("notebook_id, caderno_id")
        .in("notebook_id", sourceIds)
      for (const s of srcSyncs ?? []) {
        if (s.notebook_id && s.caderno_id != null) {
          sourceCaderno.set(s.notebook_id as string, Number(s.caderno_id))
        }
      }
    }
    for (const r of replicas ?? []) {
      const caderno = sourceCaderno.get(r.source_notebook_id as string)
      if (caderno != null && r.notebook_id) out.set(r.notebook_id as string, caderno)
    }
  }

  const stillMissing = ids.filter((id) => !out.has(id))
  if (stillMissing.length) {
    const { data: links } = await supabaseServer
      .from("quiz_question_links")
      .select("notebook_id, caderno_id")
      .in("notebook_id", stillMissing)
    for (const l of links ?? []) {
      if (l.notebook_id && l.caderno_id != null && !out.has(l.notebook_id as string)) {
        out.set(l.notebook_id as string, Number(l.caderno_id))
      }
    }
  }
  return out
}

async function findExistingUserCopy(
  sourceNotebookId: string,
  userId: string
): Promise<string | null> {
  const cadernoId = await cadernoIdForNotebook(sourceNotebookId)
  const candidateIds = new Set<string>()

  const { data: source } = await supabaseServer
    .from("notebooks")
    .select("id, user_id")
    .eq("id", sourceNotebookId)
    .maybeSingle()
  if (source?.user_id === userId) candidateIds.add(sourceNotebookId)

  const sourceIds = new Set<string>([sourceNotebookId])
  if (cadernoId != null) {
    const { data: syncs } = await supabaseServer
      .from("quiz_notebook_sync")
      .select("notebook_id")
      .eq("caderno_id", cadernoId)
    for (const s of syncs ?? []) {
      if (s.notebook_id) sourceIds.add(s.notebook_id as string)
    }
  }

  const { data: replicas } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("notebook_id")
    .eq("user_id", userId)
    .in("source_notebook_id", [...sourceIds])
  for (const r of replicas ?? []) {
    if (r.notebook_id) candidateIds.add(r.notebook_id as string)
  }

  const { data: ownedSources } = await supabaseServer
    .from("notebooks")
    .select("id")
    .eq("user_id", userId)
    .in("id", [...sourceIds])
  for (const n of ownedSources ?? []) candidateIds.add(n.id)

  if (cadernoId != null) {
    const { data: linked } = await supabaseServer
      .from("quiz_question_links")
      .select("notebook_id")
      .eq("caderno_id", cadernoId)
    const linkedIds = [...new Set((linked ?? []).map((l) => l.notebook_id as string).filter(Boolean))]
    if (linkedIds.length) {
      const { data: ownedLinked } = await supabaseServer
        .from("notebooks")
        .select("id")
        .eq("user_id", userId)
        .in("id", linkedIds)
      for (const n of ownedLinked ?? []) candidateIds.add(n.id)
    }
  }

  const ids = [...candidateIds]
  if (!ids.length) return null
  const { data: rows } = await supabaseServer
    .from("notebooks")
    .select("id, subject_id, answered_count, created_at")
    .eq("user_id", userId)
    .in("id", ids)
  return preferUserNotebook((rows ?? []) as NotebookPick[])
}

async function linkReplica(sourceNotebookId: string, userId: string, notebookId: string) {
  await supabaseServer.from("quiz_notebook_replicas").upsert(
    {
      source_notebook_id: sourceNotebookId,
      user_id: userId,
      notebook_id: notebookId,
    },
    { onConflict: "source_notebook_id,user_id" }
  )
}

/** Esconde cópias do Papa Vagas em Importados quando o caderno já está numa matéria. */
export async function excludeDuplicateUnassignedNotebooks<
  T extends { id: string },
>(userId: string, notebooks: T[]): Promise<T[]> {
  if (!notebooks.length) return notebooks
  const unassignedIds = notebooks.map((n) => n.id)
  const { data: assigned } = await supabaseServer
    .from("notebooks")
    .select("id")
    .eq("user_id", userId)
    .not("subject_id", "is", null)
  const assignedIds = (assigned ?? []).map((n) => n.id as string)
  const cadernoByNb = await cadernoIdsForNotebooks([...unassignedIds, ...assignedIds])
  const assignedCadernos = new Set(
    assignedIds.map((id) => cadernoByNb.get(id)).filter((n): n is number => n != null)
  )

  const bestByCaderno = new Map<number, T>()
  const kept: T[] = []
  for (const nb of notebooks) {
    const caderno = cadernoByNb.get(nb.id)
    if (caderno == null) {
      kept.push(nb)
      continue
    }
    if (assignedCadernos.has(caderno)) continue
    const prev = bestByCaderno.get(caderno)
    if (!prev) {
      bestByCaderno.set(caderno, nb)
      continue
    }
    const prevAns = Number((prev as { answered_count?: number }).answered_count) || 0
    const nextAns = Number((nb as { answered_count?: number }).answered_count) || 0
    if (nextAns > prevAns) bestByCaderno.set(caderno, nb)
  }
  for (const nb of bestByCaderno.values()) kept.push(nb)
  const seen = new Set(kept.map((n) => n.id))
  return notebooks.filter((n) => seen.has(n.id))
}

export async function ensureReplica(
  sourceNotebookId: string,
  userId: string
): Promise<string> {
  const already = await findExistingUserCopy(sourceNotebookId, userId)
  if (already) {
    await linkReplica(sourceNotebookId, userId, already)
    return already
  }

  const { data: source } = await supabaseServer
    .from("notebooks")
    .select("id, name, user_id")
    .eq("id", sourceNotebookId)
    .maybeSingle()
  if (!source) throw new Error("Caderno de origem não encontrado")

  if (source.user_id === userId) {
    await linkReplica(sourceNotebookId, userId, sourceNotebookId)
    return sourceNotebookId
  }

  const { data: nq } = await supabaseServer
    .from("notebook_questions")
    .select("question_id")
    .eq("notebook_id", sourceNotebookId)
    .order("position", { ascending: true })

  const ids = (nq ?? []).map((r) => r.question_id as string)
  const replicaId = await createNotebookFromQuestionIds(
    userId,
    source.name as string,
    null,
    ids,
    null,
    true
  )
  await linkReplica(sourceNotebookId, userId, replicaId)
  const { data: links } = await supabaseServer
    .from("quiz_question_links")
    .select("question_id, tec_id, caderno_id, caderno_question_id, published_question_id, short_id")
    .eq("notebook_id", sourceNotebookId)
  if (links?.length) {
    await supabaseServer.from("quiz_question_links").insert(
      links.map((l) => ({
        ...l,
        notebook_id: replicaId,
      }))
    )
  }
  return replicaId
}

export async function grantCadernoToJid(
  cadernoId: number,
  userJid: string
): Promise<
  | { ok: true; notebookId: string; already: boolean }
  | { skipped: true; reason: string }
> {
  const userId = await resolveUserIdByJid(userJid)
  if (!userId) return { skipped: true, reason: "jid_not_linked" }

  const { data: sync } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("notebook_id")
    .eq("caderno_id", cadernoId)
    .maybeSingle()
  if (!sync?.notebook_id) return { skipped: true, reason: "caderno_not_linked" }

  const sourceId = sync.notebook_id as string
  const { data: existing } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("notebook_id")
    .eq("source_notebook_id", sourceId)
    .eq("user_id", userId)
    .maybeSingle()
  const notebookId = await ensureReplica(sourceId, userId)
  return { ok: true, notebookId, already: Boolean(existing?.notebook_id) }
}

async function findQuizQuestionLink(
  shortId: string,
  cadernoId?: number | null
): Promise<{
  question_id: string
  notebook_id: string
  tec_id: number
  caderno_id: number
} | null> {
  const sid = String(shortId || "").trim().toUpperCase()
  if (!sid) return null
  async function query(filterCaderno: boolean) {
    let q = supabaseServer
      .from("quiz_question_links")
      .select("question_id, notebook_id, tec_id, caderno_id")
      .eq("short_id", sid)
    if (filterCaderno && cadernoId) q = q.eq("caderno_id", cadernoId)
    const { data: links } = await q.limit(20)
    return links ?? []
  }
  let links = await query(true)
  if (!links.length && cadernoId) links = await query(false)
  if (!links.length) return null
  const nbIds = links.map((l) => l.notebook_id)
  const { data: syncs } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("notebook_id")
    .in("notebook_id", nbIds)
  const sourceSet = new Set((syncs ?? []).map((s) => s.notebook_id as string))
  const preferred = links.find((l) => sourceSet.has(l.notebook_id)) ?? links[0]
  return preferred
}

async function findQuestionByTec(tecId: number) {
  if (!Number.isFinite(tecId) || tecId <= 0) return null
  const { data } = await supabaseServer
    .from("questions")
    .select("id, type, correct_answer")
    .eq("tec_id", tecId)
    .limit(1)
    .maybeSingle()
  return data
}

async function findUserNotebookContaining(
  userId: string,
  questionId: string
): Promise<string | null> {
  const { data: nbs } = await supabaseServer
    .from("notebooks")
    .select("id")
    .eq("user_id", userId)
  const ids = (nbs ?? []).map((n) => n.id as string)
  if (!ids.length) return null
  const { data: rows } = await supabaseServer
    .from("notebook_questions")
    .select("notebook_id")
    .eq("question_id", questionId)
    .in("notebook_id", ids)
    .limit(20)
  if (!rows?.length) return null
  const { data: syncs } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("notebook_id")
    .in("notebook_id", rows.map((r) => r.notebook_id))
  const sourceSet = new Set((syncs ?? []).map((s) => s.notebook_id as string))
  const preferred = rows.find((r) => sourceSet.has(r.notebook_id)) ?? rows[0]
  return preferred.notebook_id as string
}

async function ensureQuestionInNotebook(notebookId: string, questionId: string) {
  const { data: existing } = await supabaseServer
    .from("notebook_questions")
    .select("question_id")
    .eq("notebook_id", notebookId)
    .eq("question_id", questionId)
    .maybeSingle()
  if (existing) return
  const { data: last } = await supabaseServer
    .from("notebook_questions")
    .select("position")
    .eq("notebook_id", notebookId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  await supabaseServer.from("notebook_questions").insert({
    notebook_id: notebookId,
    question_id: questionId,
    position: (Number(last?.position) || 0) + 1,
  })
}

export async function upsertSyncedNote(
  userId: string,
  questionId: string,
  body: string
) {
  const trimmed = body.trim()
  if (!trimmed) return
  const { data: existing } = await supabaseServer
    .from("question_note_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .eq("sync_origin", "whatsapp")
    .maybeSingle()
  if (existing?.id) {
    await supabaseServer
      .from("question_note_entries")
      .update({ body: trimmed })
      .eq("id", existing.id)
    return
  }
  await supabaseServer.from("question_note_entries").insert({
    user_id: userId,
    question_id: questionId,
    body: trimmed,
    sync_origin: "whatsapp",
  })
}

async function insertInboundNoteAndEnqueueAi(input: {
  userId: string
  questionId: string
  attemptId: string | null
  notebookId: string | null
  comment: string | null
  selectedAnswer: string
  confidenceLevel: ConfidenceLevel
  durationMs: number | null
  tags?: string[]
}) {
  let attemptId = input.attemptId
  if (!attemptId) {
    const { data: last } = await supabaseServer
      .from("question_attempts")
      .select("id")
      .eq("user_id", input.userId)
      .eq("question_id", input.questionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    attemptId = (last?.id as string | undefined) ?? null
  }
  if (!attemptId) return

  const { enqueueQuestionResolveAi } = await import("./ai/question-resolve-ai")
  await enqueueQuestionResolveAi({
    userId: input.userId,
    questionId: input.questionId,
    attemptId,
    notebookId: input.notebookId,
    noteDraft: input.comment,
    selectedAnswer: input.selectedAnswer,
    confidenceLevel: input.confidenceLevel,
    durationMs: input.durationMs,
    tags: input.tags,
    pushWhatsapp: false,
    idempotencyKey: input.comment
      ? `question_ai:${attemptId}:inbound`
      : `question_ai:${attemptId}`,
  })
  void import("./ai/jobs/kick").then((m) => m.kickQuestionAiWorker(input.userId))
}

async function findQuestionInNotebook(
  notebookId: string,
  opts: { tecId?: number | null; questionId?: string | null }
): Promise<{ id: string; type: string; correct_answer: string } | null> {
  const { data: rows } = await supabaseServer
    .from("notebook_questions")
    .select("question_id")
    .eq("notebook_id", notebookId)
  const ids = (rows ?? []).map((r) => r.question_id as string)
  if (!ids.length) return null

  if (opts.tecId) {
    const { data: qs } = await supabaseServer
      .from("questions")
      .select("id, type, correct_answer")
      .eq("tec_id", opts.tecId)
      .in("id", ids)
      .limit(1)
    const q = qs?.[0]
    if (q) return q
  }
  if (opts.questionId && ids.includes(opts.questionId)) {
    const { data: q } = await supabaseServer
      .from("questions")
      .select("id, type, correct_answer")
      .eq("id", opts.questionId)
      .maybeSingle()
    if (q) return q
  }
  return null
}

function studyQuestionMeta(q: { id: string; type: string; correct_answer: string }) {
  let questionType = q.type || "multiple_choice"
  const correct = q.correct_answer ?? ""
  if (/^(certo|errado)$/i.test(correct)) questionType = "certo_errado"
  return { questionId: q.id, questionType, correct }
}

async function resolveStudyTargetFromWa(input: {
  userJid: string
  tecId?: number | null
  shortId?: string | null
  cadernoId?: number | null
}): Promise<
  | {
      ok: true
      userId: string
      notebookId: string | null
      questionId: string
      questionType: string
      correct: string
    }
  | { ok: false; reason: string }
> {
  const userId = await resolveUserIdByJid(input.userJid)
  if (!userId) return { ok: false, reason: "jid_not_linked" }

  let linkQuestionId: string | null = null
  let tecId = input.tecId != null ? Number(input.tecId) : null
  if (tecId != null && (!Number.isFinite(tecId) || tecId <= 0)) tecId = null
  let sourceNotebookId: string | null = null

  if (input.cadernoId) {
    const { data: sync } = await supabaseServer
      .from("quiz_notebook_sync")
      .select("notebook_id")
      .eq("caderno_id", input.cadernoId)
      .maybeSingle()
    sourceNotebookId = (sync?.notebook_id as string | undefined) ?? null
  }

  if (input.shortId) {
    const link = await findQuizQuestionLink(input.shortId, input.cadernoId)
    if (link) {
      linkQuestionId = link.question_id
      if (link.tec_id != null) tecId = Number(link.tec_id)
      if (!sourceNotebookId) sourceNotebookId = link.notebook_id
    }
  }

  const candidates: string[] = []
  if (sourceNotebookId) {
    candidates.push(await ensureReplica(sourceNotebookId, userId))
  }
  if (tecId) {
    const byTec = await resolveSentNotebookForTec(userId, tecId, input.cadernoId)
    if (byTec && !candidates.includes(byTec)) candidates.push(byTec)
    if (input.cadernoId) {
      const anyTec = await resolveSentNotebookForTec(userId, tecId, null)
      if (anyTec && !candidates.includes(anyTec)) candidates.push(anyTec)
    }
  }

  let notebookId: string | null = null
  let found: { id: string; type: string; correct_answer: string } | null = null
  for (const nb of candidates) {
    const inNb = await findQuestionInNotebook(nb, {
      tecId,
      questionId: linkQuestionId,
    })
    if (inNb) {
      notebookId = nb
      found = inNb
      break
    }
  }

  if (!found && sourceNotebookId) {
    const inSource = await findQuestionInNotebook(sourceNotebookId, {
      tecId,
      questionId: linkQuestionId,
    })
    if (inSource) {
      notebookId = await ensureReplica(sourceNotebookId, userId)
      await ensureQuestionInNotebook(notebookId, inSource.id)
      found = inSource
    }
  }

  if (!found && tecId) {
    const byTec = await findQuestionByTec(tecId)
    if (byTec) found = byTec
  }

  if (!found && linkQuestionId) {
    const { data: q } = await supabaseServer
      .from("questions")
      .select("id, type, correct_answer")
      .eq("id", linkQuestionId)
      .maybeSingle()
    if (q) found = q
  }

  if (!found) return { ok: false, reason: "question_not_found" }

  if (!notebookId) {
    notebookId = await findUserNotebookContaining(userId, found.id)
  }
  if (notebookId) await ensureQuestionInNotebook(notebookId, found.id)

  return {
    ok: true,
    userId,
    notebookId,
    ...studyQuestionMeta(found),
  }
}

export async function ingestWhatsappAnswer(input: {
  tecId: number | null
  shortId?: string | null
  cadernoId?: number | null
  userJid: string
  answerLetter: string
  comment?: string | null
  confidenceLevel?: string
  durationMs?: number | null
  tags?: string[]
}) {
  const target = await resolveStudyTargetFromWa(input)
  if (!target.ok) return { skipped: true, reason: target.reason }

  const { userId, notebookId, questionId, questionType, correct } = target
  const selected = fromWaLetter(questionType, input.answerLetter)
  const isCorrect = normalizeAnswer(questionType, selected, correct)
  const confidence = parseConfidenceLevel(input.confidenceLevel)

  const { data: existingRows } = await supabaseServer
    .from("question_attempts")
    .select("id, selected_answer, duration_ms, notebook_id")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(10)
  const existing =
    (notebookId
      ? existingRows?.find((r) => r.notebook_id === notebookId)
      : existingRows?.find((r) => r.notebook_id == null)) ??
    existingRows?.[0] ??
    null
  const duration = capDurationMs(input.durationMs)
  let inboundAttemptId: string | null = null
  if (existing) {
    const stored = String(existing.selected_answer || "")
    const needsFix =
      questionType === "certo_errado" && !/^(certo|errado)$/i.test(stored)
    const patch: Record<string, unknown> = {}
    if (needsFix || (selected && stored !== selected)) {
      patch.selected_answer = selected
      patch.is_correct = isCorrect
      patch.confidence_level = confidence
    }
    if (duration && !(Number(existing.duration_ms) > 0)) patch.duration_ms = duration
    if (notebookId && !existing.notebook_id) patch.notebook_id = notebookId
    if (Object.keys(patch).length) {
      await supabaseServer.from("question_attempts").update(patch).eq("id", existing.id)
    }
    if (input.comment) {
      await insertInboundNoteAndEnqueueAi({
        userId,
        questionId,
        attemptId: existing.id as string,
        notebookId,
        comment: input.comment,
        selectedAnswer: selected,
        confidenceLevel: confidence,
        durationMs: duration,
        tags: input.tags,
      })
    }
    if (input.tags?.length) {
      await supabaseServer
        .from("question_attempts")
        .update({ attempt_tags: input.tags })
        .eq("id", existing.id)
    }
    if (notebookId) await refreshNotebookProgress(notebookId, userId)
    return { ok: true, already: true, notebook_id: notebookId, question_id: questionId }
  }

  try {
    const recorded = await recordAttempt({
      user_id: userId,
      question_id: questionId,
      notebook_id: notebookId,
      study_session_id: null,
      selected_answer: selected,
      is_correct: isCorrect,
      duration_ms: duration,
      confidence_level: confidence,
      attempt_tags: input.tags?.length ? input.tags : undefined,
    })
    inboundAttemptId = recorded.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    if (!/attempt_tags/i.test(msg)) throw e
  }

  if (input.tags?.length) {
    const { data: last } = await supabaseServer
      .from("question_attempts")
      .select("id")
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (last?.id) {
      await supabaseServer
        .from("question_attempts")
        .update({ attempt_tags: input.tags })
        .eq("id", last.id)
    }
  }

  if (input.comment) {
    await insertInboundNoteAndEnqueueAi({
      userId,
      questionId,
      attemptId: inboundAttemptId,
      notebookId,
      comment: input.comment,
      selectedAnswer: selected,
      confidenceLevel: confidence,
      durationMs: duration,
      tags: input.tags,
    })
  } else if (inboundAttemptId) {
    await insertInboundNoteAndEnqueueAi({
      userId,
      questionId,
      attemptId: inboundAttemptId,
      notebookId,
      comment: null,
      selectedAnswer: selected,
      confidenceLevel: confidence,
      durationMs: duration,
      tags: input.tags,
    })
  }
  if (notebookId) await refreshNotebookProgress(notebookId, userId)

  return {
    ok: true,
    is_correct: isCorrect,
    outcome_category: computeOutcomeCategory(confidence, isCorrect),
    notebook_id: notebookId,
    question_id: questionId,
  }
}

export async function getWhatsappStudyContext(input: {
  userJid: string
  tecId?: number | null
  shortId?: string | null
  cadernoId?: number | null
}) {
  const target = await resolveStudyTargetFromWa(input)
  if (!target.ok) return { linked: false, reason: target.reason, notes: [], durationMs: null }

  const { data: attempt } = await supabaseServer
    .from("question_attempts")
    .select("duration_ms")
    .eq("user_id", target.userId)
    .eq("question_id", target.questionId)
    .not("duration_ms", "is", null)
    .gt("duration_ms", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: notes } = await supabaseServer
    .from("question_note_entries")
    .select("id, body, created_at, sync_origin, ai_feedback")
    .eq("user_id", target.userId)
    .eq("question_id", target.questionId)
    .order("created_at", { ascending: true })

  return {
    linked: true,
    durationMs: attempt?.duration_ms != null ? Number(attempt.duration_ms) : null,
    notes: (notes ?? []).map((n) => ({
      id: n.id,
      body: n.body,
      created_at: n.created_at,
      origin: n.sync_origin === "whatsapp" ? "whatsapp" : "app",
      ai_feedback:
        typeof n.ai_feedback === "string" && n.ai_feedback.trim()
          ? n.ai_feedback
          : null,
    })),
  }
}

export async function addWhatsappStudyNote(input: {
  userJid: string
  tecId?: number | null
  shortId?: string | null
  cadernoId?: number | null
  body: string
}) {
  const target = await resolveStudyTargetFromWa(input)
  if (!target.ok) return { skipped: true, reason: target.reason }
  const trimmed = String(input.body || "").trim()
  if (!trimmed) return { skipped: true, reason: "empty" }

  const { data, error } = await supabaseServer
    .from("question_note_entries")
    .insert({
      user_id: target.userId,
      question_id: target.questionId,
      body: trimmed,
    })
    .select("id, body, created_at")
    .single()
  if (error) throw new Error(error.message)

  const { data: attempt } = await supabaseServer
    .from("question_attempts")
    .select("id, selected_answer, confidence_level, duration_ms, notebook_id")
    .eq("user_id", target.userId)
    .eq("question_id", target.questionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (attempt?.id) {
    const { enqueueQuestionResolveAi } = await import("./ai/question-resolve-ai")
    await enqueueQuestionResolveAi({
      userId: target.userId,
      questionId: target.questionId,
      attemptId: attempt.id as string,
      notebookId: (attempt.notebook_id as string | null) ?? target.notebookId,
      selectedAnswer: String(attempt.selected_answer ?? ""),
      confidenceLevel: attempt.confidence_level as string | undefined,
      durationMs: attempt.duration_ms == null ? null : Number(attempt.duration_ms),
      pushWhatsapp: false,
      idempotencyKey: `question_ai:${attempt.id}:note:${data.id}`,
    })
    void import("./ai/jobs/kick").then((m) => m.kickQuestionAiWorker(target.userId))
  }

  return {
    ok: true,
    note: {
      id: data.id,
      body: data.body,
      created_at: data.created_at,
      origin: "whatsapp" as const,
    },
  }
}

export async function pushAnswerToWhatsapp(input: {
  userId: string
  questionId: string
  selectedAnswer: string
  confidenceLevel: ConfidenceLevel
  durationMs: number | null
  comment?: string | null
  aiComment?: string | null
  aiUpdate?: boolean
  tags?: string[]
  notebookId?: string | null
  cadernoId?: number | null
}) {
  const ident = await resolveWhatsappIdentity(input.userId)
  if (!ident) {
    await logQuizSyncEvent({
      direction: "out",
      kind: "ingest",
      ok: false,
      reason: "no_jid",
      caderno_id: input.cadernoId ?? null,
      user_jid: null,
      payload: { userId: input.userId, questionId: input.questionId },
    })
    return { skipped: true, reason: "no_jid" }
  }
  const { jid, userName } = ident
  const ingestUrl = getQuizSyncIngestUrl()
  if (!ingestUrl) return { skipped: true, reason: "no_quiz_url" }

  const { data: q } = await supabaseServer
    .from("questions")
    .select("id, tec_id, type")
    .eq("id", input.questionId)
    .maybeSingle()
  if (!q) return { skipped: true, reason: "no_question" }

  let cadernoId = input.cadernoId ?? null
  if (!cadernoId && input.notebookId) {
    const sent = await getSentCadernoForNotebook(input.notebookId)
    cadernoId = sent?.cadernoId ?? null
  }

  let linkQuery = supabaseServer
    .from("quiz_question_links")
    .select("short_id, caderno_id")
    .eq("question_id", input.questionId)
    .not("short_id", "is", null)
  if (cadernoId) linkQuery = linkQuery.eq("caderno_id", cadernoId)
  const { data: link } = await linkQuery.limit(1).maybeSingle()

  if (!cadernoId && link?.caderno_id) cadernoId = Number(link.caderno_id)

  const { res, data } = await quizFetch(
    ingestUrl,
    {
      method: "POST",
      body: JSON.stringify({
        userJid: jid,
        userName,
        tecId: q.tec_id,
        cadernoId,
        shortId: link?.short_id ?? null,
        answerLetter: toWaLetter(q.type, input.selectedAnswer),
        comment: input.comment ?? null,
        aiComment: input.aiComment ?? null,
        aiUpdate: Boolean(input.aiUpdate),
        confidenceLevel: input.confidenceLevel,
        durationMs: input.durationMs,
        tags: input.tags ?? [],
      }),
    },
    {
      kind: "ingest",
      cadernoId,
      tecId: q.tec_id != null ? Number(q.tec_id) : null,
      userJid: jid,
    }
  )
  return { ok: res.ok, pending: Boolean(data.pending), data }
}

/** Reenvia ingest que falhou por user_name nulo (e outros erros) com o nome preenchido. */
export async function retryFailedIngests(userId: string, limit = 80) {
  const ident = await resolveWhatsappIdentity(userId)
  const ingestUrl = getQuizSyncIngestUrl()
  if (!ident || !ingestUrl) return { retried: 0 }
  const { data: rows } = await supabaseServer
    .from("quiz_sync_event_log")
    .select("id, payload, tec_id, caderno_id, user_jid")
    .eq("kind", "ingest")
    .eq("direction", "out")
    .eq("ok", false)
    .in("user_jid", jidCandidates(ident.jid))
    .order("created_at", { ascending: false })
    .limit(limit)

  const seen = new Set<string>()
  const unique: { req: Record<string, unknown>; cadernoId: number | null; tecId: number | null }[] =
    []
  for (const row of rows ?? []) {
    const payload = row.payload as { request?: Record<string, unknown> } | null
    const req = payload && typeof payload === "object" ? payload.request : null
    if (!req || typeof req !== "object") continue
    const key = `${req.tecId ?? ""}:${req.shortId ?? ""}:${req.cadernoId ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({
      req,
      cadernoId: req.cadernoId != null ? Number(req.cadernoId) : row.caderno_id ?? null,
      tecId: req.tecId != null ? Number(req.tecId) : row.tec_id ?? null,
    })
  }
  const results = await Promise.all(
    unique.map(async ({ req, cadernoId, tecId }) => {
      const { res } = await quizFetch(
        ingestUrl,
        {
          method: "POST",
          body: JSON.stringify({ ...req, userJid: ident.jid, userName: ident.userName }),
        },
        {
          kind: "ingest",
          cadernoId,
          tecId,
          userJid: ident.jid,
        }
      )
      return res.ok
    })
  )
  return { retried: results.filter(Boolean).length }
}

export async function flushPendingForTec(input: {
  tecId: number | null
  shortId: string
  publishedQuestionId?: number
  cadernoId?: number
}) {
  if (input.shortId && input.tecId) {
    let upd = supabaseServer
      .from("quiz_question_links")
      .update({
        short_id: input.shortId.toUpperCase(),
        published_question_id: input.publishedQuestionId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("tec_id", input.tecId)
    if (input.cadernoId) upd = upd.eq("caderno_id", input.cadernoId)
    await upd
  }
  if (!input.tecId) return { flushed: 0, reason: "no_tec_id" }

  const { data: q } = await supabaseServer
    .from("questions")
    .select("id")
    .eq("tec_id", input.tecId)
    .maybeSingle()
  if (!q) return { flushed: 0, reason: "no_question" }

  let attemptQuery = supabaseServer
    .from("question_attempts")
    .select("user_id, question_id, selected_answer, confidence_level, duration_ms, attempt_tags, notebook_id")
    .eq("question_id", q.id)
    .order("created_at", { ascending: false })

  if (input.cadernoId) {
    const nbIds = await notebooksForCaderno(input.cadernoId)
    if (nbIds.length) attemptQuery = attemptQuery.in("notebook_id", nbIds)
  }

  const { data: attempts } = await attemptQuery
  if (!attempts?.length) return { flushed: 0, reason: "no_attempts" }

  const seen = new Set<string>()
  let flushed = 0
  let lastSkip: string | null = null
  for (const a of attempts) {
    if (seen.has(a.user_id)) continue
    seen.add(a.user_id)
    const result = await pushAnswerToWhatsapp({
      userId: a.user_id,
      questionId: a.question_id,
      selectedAnswer: a.selected_answer,
      confidenceLevel: parseConfidenceLevel(a.confidence_level),
      durationMs: a.duration_ms,
      tags: Array.isArray(a.attempt_tags) ? a.attempt_tags : [],
      notebookId: a.notebook_id,
      cadernoId: input.cadernoId ?? null,
    })
    if (result.ok && !result.pending) flushed += 1
    else if ("reason" in result && result.reason) lastSkip = String(result.reason)
    else if (result.pending) lastSkip = "pending"
  }
  return {
    flushed,
    reason: flushed > 0 ? null : lastSkip ?? "push_failed",
  }
}

export async function sendNotebookToWhatsapp(input: {
  notebookId: string
  userId: string
  name?: string
  activate?: boolean
  deliveryMode?: "group" | "private"
  schedule?: Record<string, unknown>
  privateRecipients?: { userJid: string; active?: boolean }[]
  createdByJid?: string
}) {
  const url = getQuizCadernoFromJsonUrl()
  if (!url) throw new Error("Configure QUIZ_BOT_USERS_URL")

  const { data: nq, error } = await supabaseServer
    .from("notebook_questions")
    .select(
      `
      position,
      question_id,
      questions (
        id, tec_id, tec_url, type, banca, tec_subject, statement, correct_answer
      )
    `
    )
    .eq("notebook_id", input.notebookId)
    .order("position", { ascending: true })
  if (error) throw new Error(error.message)

  const qids = (nq ?? []).map((r) => r.question_id as string)
  const { data: opts } = await supabaseServer
    .from("question_options")
    .select("question_id, label, text, sort_order")
    .in("question_id", qids)
    .order("sort_order")
  const optsByQ = new Map<string, { label: string; text: string }[]>()
  for (const o of opts ?? []) {
    const list = optsByQ.get(o.question_id) ?? []
    list.push({ label: o.label, text: o.text })
    optsByQ.set(o.question_id, list)
  }

  const questions = (nq ?? []).map((row, i) => {
    const q = unwrapQ(row.questions)
    return {
      position: i + 1,
      tecQuestionId: q?.tec_id,
      tecUrl: q?.tec_url,
      banca: q?.banca,
      subject: q?.tec_subject,
      questionType: q?.type,
      statement: q?.statement,
      options: optsByQ.get(row.question_id) ?? [],
      answerKey: q?.correct_answer,
    }
  })

  const { data: nb } = await supabaseServer
    .from("notebooks")
    .select("name")
    .eq("id", input.notebookId)
    .maybeSingle()

  const { res, data } = await quizFetch(
    url,
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name || nb?.name || "Caderno",
        originNotebookId: input.notebookId,
        activate: Boolean(input.activate),
        deliveryMode: input.deliveryMode ?? "group",
        schedule: input.schedule ?? {},
        privateRecipients: input.privateRecipients ?? [],
        createdByJid: input.createdByJid ?? null,
        questions,
      }),
    },
    { kind: "send" }
  )
  if (!res.ok) {
    throw new Error(data.error || `Papa Vagas ${res.status}`)
  }

  const cadernoId = data.cadernoId
  const totalQuestions = Number(data.totalQuestions) || 0
  if (!cadernoId || totalQuestions <= 0) {
    throw new Error(
      "Caderno criado sem questões no Papa Vagas. Apague o caderno vazio lá e envie de novo."
    )
  }

  await supabaseServer.from("quiz_notebook_sync").upsert(
    {
      notebook_id: input.notebookId,
      caderno_id: cadernoId,
      status: data.status === "inactive" ? "pending" : (data.status ?? "pending"),
      delivery_mode: input.deliveryMode ?? "group",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "notebook_id" }
  )
  await supabaseServer.from("quiz_notebook_replicas").upsert(
    {
      source_notebook_id: input.notebookId,
      user_id: input.userId,
      notebook_id: input.notebookId,
    },
    { onConflict: "source_notebook_id,user_id" }
  )
  const remoteByPos = new Map<number, { id?: number; tecQuestionId?: string | null }>()
  for (const rq of Array.isArray(data.questions) ? data.questions : []) {
    const pos = Number(rq.position)
    if (Number.isFinite(pos)) remoteByPos.set(pos, rq)
  }
  const linkRows = (nq ?? []).map((row, i) => {
    const q = unwrapQ(row.questions)
    const remote = remoteByPos.get(i + 1)
    return {
      notebook_id: input.notebookId,
      question_id: row.question_id,
      tec_id: q?.tec_id ?? 0,
      caderno_id: cadernoId,
      caderno_question_id: remote?.id ?? null,
    }
  })
  await supabaseServer.from("quiz_question_links").upsert(linkRows, {
    onConflict: "notebook_id,question_id",
  })
  return data
}

function unwrapQ(q: unknown): {
  id?: string
  tec_id?: number
  tec_url?: string
  type?: string
  banca?: string | null
  tec_subject?: string | null
  statement?: string
  correct_answer?: string
} | null {
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : (q as never)
}

export async function maybePushNotebookAnswer(input: {
  notebookId: string
  userId: string
  questionId: string
  selectedAnswer: string
  confidenceLevel: ConfidenceLevel
  durationMs: number | null
  comment?: string | null
  aiComment?: string | null
  aiUpdate?: boolean
  tags?: string[]
}) {
  const sent = await getSentCadernoForNotebook(input.notebookId)
  const { data: replica } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("id")
    .eq("notebook_id", input.notebookId)
    .eq("user_id", input.userId)
    .maybeSingle()
  if (!sent && !replica) return { skipped: true }
  return pushAnswerToWhatsapp({
    userId: input.userId,
    questionId: input.questionId,
    selectedAnswer: input.selectedAnswer,
    confidenceLevel: input.confidenceLevel,
    durationMs: input.durationMs,
    comment: input.comment,
    aiComment: input.aiComment,
    aiUpdate: input.aiUpdate,
    tags: input.tags,
    notebookId: input.notebookId,
    cadernoId: sent?.cadernoId ?? null,
  })
}

export async function backfillWhatsappAnswers(userId: string, userJid: string) {
  const url = getQuizSyncAnswersUrl()
  if (!url) return { skipped: true as const, imported: 0 }
  const { res, data } = await quizFetch(
    `${url}?userJid=${encodeURIComponent(userJid)}&limit=300`
  )
  if (!res.ok) return { skipped: true as const, imported: 0, error: data.error }
  const answers = Array.isArray(data.answers) ? data.answers : []
  let imported = 0
  for (const a of answers) {
    const letter = String(a.answerLetter || "").trim()
    if (!letter) continue
    try {
      const result = await ingestWhatsappAnswer({
        tecId: a.tecId != null ? Number(a.tecId) : null,
        shortId: a.shortId ?? null,
        cadernoId: a.cadernoId != null ? Number(a.cadernoId) : null,
        userJid,
        answerLetter: letter,
        comment: a.comment ?? null,
        confidenceLevel: a.confidenceLevel,
        durationMs: a.durationMs ?? null,
        tags: Array.isArray(a.tags) ? a.tags : [],
      })
      if (result && "ok" in result && result.ok) imported += 1
    } catch {
      /* ignore item */
    }
  }
  return { skipped: false as const, imported }
}

export async function fetchOmissasFromQuiz(token: string) {
  const url = getQuizSyncOmissasUrl()
  if (!url) throw new Error("Configure QUIZ_BOT_USERS_URL")
  const { res, data } = await quizFetch(`${url}?t=${encodeURIComponent(token)}`)
  if (!res.ok) throw new Error(data.error || "Falha ao carregar omissas")
  return data
}

export async function fetchQuizInventory(userJid: string) {
  const url = getQuizSyncInventoryUrl()
  if (!url) return { assistEliminateQty: 0, categories: [] }
  const { res, data } = await quizFetch(`${url}?userJid=${encodeURIComponent(userJid)}`)
  if (!res.ok) return { assistEliminateQty: 0, categories: [] }
  return data
}

export async function callQuizAssist(userJid: string, shortId: string, letter: string) {
  const url = getQuizSyncAssistUrl()
  if (!url) throw new Error("Configure QUIZ_BOT_USERS_URL")
  const { res, data } = await quizFetch(url, {
    method: "POST",
    body: JSON.stringify({ userJid, shortId, letter }),
  })
  if (!res.ok) throw new Error(data.error || "Erro na assistência")
  return data
}

export async function unlinkCadernoFromApp(cadernoId: number) {
  await supabaseServer.from("quiz_question_links").delete().eq("caderno_id", cadernoId)
  await supabaseServer.from("quiz_notebook_sync").delete().eq("caderno_id", cadernoId)
}

export async function replayPendingGabaritos(days = 3) {
  const url = getQuizSyncReplayGabaritoUrl()
  if (!url) throw new Error("Configure QUIZ_BOT_USERS_URL")
  const { res, data } = await quizFetch(
    url,
    {
      method: "POST",
      body: JSON.stringify({ days }),
    },
    { kind: "replay" }
  )
  if (!res.ok) throw new Error(data.error || "Falha ao reenfileirar gabaritos")
  return data as {
    ok: boolean
    days: number
    considered: number
    queued: number
    skippedPosted: number
    hint?: string
  }
}

export type SyncPerson = {
  label: string
  userJid: string | null
  appSynced: boolean
  chatbotSynced: boolean
  line: string
}

export async function fetchAppSideRoster(cadernoId: number): Promise<{
  notebookId: string | null
  people: { label: string; userJid: string | null; appSynced: boolean }[]
}> {
  const { data: sync } = await supabaseServer
    .from("quiz_notebook_sync")
    .select("notebook_id")
    .eq("caderno_id", cadernoId)
    .maybeSingle()
  const notebookId = (sync?.notebook_id as string | undefined) ?? null
  const people: { label: string; userJid: string | null; appSynced: boolean }[] = []
  if (!notebookId) return { notebookId: null, people }

  const { data: nb } = await supabaseServer
    .from("notebooks")
    .select("user_id")
    .eq("id", notebookId)
    .maybeSingle()
  const { data: replicas } = await supabaseServer
    .from("quiz_notebook_replicas")
    .select("user_id")
    .eq("source_notebook_id", notebookId)
  const userIds = [
    ...new Set(
      [nb?.user_id, ...(replicas ?? []).map((r) => r.user_id)].filter(Boolean) as string[]
    ),
  ]
  if (!userIds.length) return { notebookId, people }

  const { data: settings } = await supabaseServer
    .from("flashcard_bot_settings")
    .select("user_id, whatsapp_jid, whatsapp_display_label, whatsapp_authorized")
    .in("user_id", userIds)
  for (const uid of userIds) {
    const s = settings?.find((x) => x.user_id === uid)
    people.push({
      label: s?.whatsapp_display_label || s?.whatsapp_jid || uid.slice(0, 8),
      userJid: s?.whatsapp_jid ?? null,
      appSynced: Boolean(s?.whatsapp_jid && s.whatsapp_authorized),
    })
  }
  return { notebookId, people }
}

export async function fetchCadernoSyncRoster(cadernoId: number): Promise<{
  cadernoId: number
  notebookId: string | null
  originNotebookId: string | null
  people: SyncPerson[]
}> {
  const appSide = await fetchAppSideRoster(cadernoId)
  const notebookId = appSide.notebookId

  const statusUrl = getQuizSyncStatusUrl()
  let engaged: { userJid: string; displayLabel?: string; engaged?: boolean }[] = []
  let links: { userJid: string; displayLabel?: string | null; status?: string }[] = []
  if (statusUrl) {
    const { res, data } = await quizFetch(`${statusUrl}?cadernoId=${cadernoId}`, undefined, {
      kind: "status",
      cadernoId,
    })
    if (res.ok) {
      engaged = Array.isArray(data.engaged) ? data.engaged : []
      links = Array.isArray(data.flashcardsLinks) ? data.flashcardsLinks : []
    }
  }

  const chatbotByJid = new Map<string, { label: string; synced: boolean }>()
  for (const e of engaged) {
    if (!e.userJid) continue
    chatbotByJid.set(e.userJid, {
      label: e.displayLabel || e.userJid,
      synced: e.engaged !== false,
    })
  }
  for (const l of links) {
    if (!l.userJid) continue
    const prev = chatbotByJid.get(l.userJid)
    chatbotByJid.set(l.userJid, {
      label: l.displayLabel || prev?.label || l.userJid,
      synced: l.status === "active" || Boolean(prev?.synced),
    })
  }

  const seenJid = new Set<string>()
  const people: SyncPerson[] = []
  for (const p of appSide.people) {
    if (p.userJid) seenJid.add(p.userJid)
    const bot = p.userJid ? chatbotByJid.get(p.userJid) : undefined
    const chatbotSynced = Boolean(bot?.synced)
    people.push({
      label: p.label,
      userJid: p.userJid,
      appSynced: p.appSynced,
      chatbotSynced,
      line: `${p.label} — ${p.appSynced ? "sincronizado" : "não sincronizado"} no app · ${
        chatbotSynced ? "sincronizado" : "não sincronizado"
      } no chatbot`,
    })
  }
  for (const [jid, bot] of chatbotByJid) {
    if (seenJid.has(jid)) continue
    people.push({
      label: bot.label,
      userJid: jid,
      appSynced: false,
      chatbotSynced: bot.synced,
      line: `${bot.label} — não sincronizado no app · ${
        bot.synced ? "sincronizado" : "não sincronizado"
      } no chatbot`,
    })
  }

  return {
    cadernoId,
    notebookId,
    originNotebookId: notebookId,
    people,
  }
}
